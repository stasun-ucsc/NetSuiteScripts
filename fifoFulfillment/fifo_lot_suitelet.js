/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Script: fifo_lot_suitelet.js
 * Description: Receives a Sales Order ID, creates an Item Fulfillment server-side
 *              in dynamic mode, allocates FIFO YYWW lot numbers across all lines,
 *              saves the record, and redirects the user to the new fulfillment.
 */

define(['N/record', 'N/search', 'N/redirect', 'N/log'], (record, search, redirect, log) => {

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  const yywwToSortKey = (yyww) => parseInt(yyww, 10);
  const isYYWW        = (lotNumber) => /^\d{4}$/.test(lotNumber);

  const getFifoLots = (itemId, locationId) => {
    const filters = [
      search.createFilter({ name: 'item',            operator: search.Operator.ANYOF,        values: itemId }),
      search.createFilter({ name: 'quantityonhand',  join: 'inventoryNumber', operator: search.Operator.GREATERTHAN, values: 0 }),
    ];

    if (locationId) {
      filters.push(
        search.createFilter({ name: 'location', operator: search.Operator.ANYOF, values: locationId })
      );
    }

    const lotSearch = search.create({
      type: search.Type.INVENTORY_BALANCE,
      filters,
      columns: [
        search.createColumn({ name: 'inventorynumber' }),
        search.createColumn({ name: 'quantityonhand', join: 'inventoryNumber' }),
      ],
    });

    const lots = [];

    lotSearch.run().each((result) => {
      const lotNumber = result.getValue({ name: 'inventorynumber' });
      const qtyOnHand = parseFloat(
        result.getValue({ name: 'quantityonhand', join: 'inventoryNumber' }) || 0
      );
      if (isYYWW(lotNumber) && qtyOnHand > 0) {
        lots.push({ lotNumber, quantityAvailable: qtyOnHand });
      }
      return true;
    });

    lots.sort((a, b) => yywwToSortKey(a.lotNumber) - yywwToSortKey(b.lotNumber));

    log.debug({ title: `FIFO lots for item ${itemId}`, details: JSON.stringify(lots) });

    return lots;
  };

  const allocateFifo = (lots, quantityRequired) => {
    const allocations = [];
    let remaining = quantityRequired;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.quantityAvailable, remaining);
      allocations.push({ lotNumber: lot.lotNumber, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      log.audit({
        title: 'FIFO short allocation',
        details: `Short by ${remaining} units after exhausting all YYWW lots`,
      });
    }

    return allocations;
  };

  // ─── MAIN ──────────────────────────────────────────────────────────────────

  const onRequest = (context) => {
    const { request, response } = context;
    const soId = request.parameters.soId;

    if (!soId) {
      response.write('Error: Missing Sales Order ID.');
      return;
    }

    try {
      log.audit({ title: 'fifo_fulfill_suitelet', details: `Transforming SO ${soId} to Item Fulfillment` });

      // Transform SO → Item Fulfillment in dynamic mode
      const fulfillmentRec = record.transform({
        fromType:   record.Type.SALES_ORDER,
        fromId:     parseInt(soId, 10),
        toType:     record.Type.ITEM_FULFILLMENT,
        isDynamic:  true, // required for subrecord line editing
      });

      const numLines = fulfillmentRec.getLineCount({ sublistId: 'item' });

      for (let i = 0; i < numLines; i++) {
        try {
          const itemIsFulfilled = fulfillmentRec.getSublistValue({
            sublistId: 'item',
            fieldId:   'itemreceive',
            line: i,
          });
          if (!itemIsFulfilled) continue;

          const itemId      = fulfillmentRec.getSublistValue({ sublistId: 'item', fieldId: 'item',     line: i });
          const locationId  = fulfillmentRec.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
          const qtyToFulfill = parseFloat(
            fulfillmentRec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }) || 0
          );

          if (!itemId || qtyToFulfill <= 0) continue;

          const fifoLots = getFifoLots(itemId, locationId);
          if (!fifoLots.length) {
            log.audit({ title: 'No YYWW lots found', details: `Item: ${itemId}, Location: ${locationId}` });
            continue;
          }

          const allocations = allocateFifo(fifoLots, qtyToFulfill);

          // Select the line in dynamic mode before accessing its subrecord
          fulfillmentRec.selectLine({ sublistId: 'item', line: i });

          const inventoryDetail = fulfillmentRec.getCurrentSublistSubrecord({
            sublistId: 'item',
            fieldId:   'inventorydetail',
          });

          if (!inventoryDetail) continue;

          const existingLines = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });

          allocations.forEach((alloc, j) => {
            if (j < existingLines) {
              // Edit pre-existing line
              inventoryDetail.selectLine({ sublistId: 'inventoryassignment', line: j });
            } else {
              // Add a new line — supported server-side in dynamic mode
              inventoryDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            }

            inventoryDetail.setCurrentSublistValue({
              sublistId: 'inventoryassignment',
              fieldId:   'receiptinventorynumber',
              value:     alloc.lotNumber,
            });

            inventoryDetail.setCurrentSublistValue({
              sublistId: 'inventoryassignment',
              fieldId:   'quantity',
              value:     alloc.quantity,
            });

            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });

            log.debug({
              title: 'Lot assigned',
              details: `Line ${i} → Lot ${alloc.lotNumber}, Qty ${alloc.quantity}`,
            });
          });

          // Remove leftover pre-populated lines from the bottom up
          const finalLineCount = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });
          for (let k = finalLineCount - 1; k >= allocations.length; k--) {
            inventoryDetail.removeLine({ sublistId: 'inventoryassignment', line: k });
          }

          // Commit the item line after editing its subrecord
          fulfillmentRec.commitLine({ sublistId: 'item' });

        } catch (lineError) {
          log.error({ title: `Error on line ${i}`, details: lineError.message });
        }
      }

      // Save the fulfillment record and get its new ID
      const fulfillmentId = fulfillmentRec.save({ enableSourcing: true, ignoreMandatoryFields: false });

      log.audit({ title: 'Fulfillment saved', details: `Item Fulfillment ID: ${fulfillmentId}` });

      // Redirect user to the new Item Fulfillment record
      redirect.toRecord({
        type: record.Type.ITEM_FULFILLMENT,
        id:   fulfillmentId,
      });

    } catch (e) {
      log.error({ title: 'fifo_fulfill_suitelet fatal error', details: e.message });
      response.write(`Error creating fulfillment: ${e.message}`);
    }
  };

  return { onRequest: onRequest };
});
