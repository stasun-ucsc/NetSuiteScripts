/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * Script: fifo_lot_client.js
 * Description: On pageInit of a new Item Fulfillment, calls the FIFO Suitelet
 *              for each item line and populates Inventory Detail lot numbers.
 */

define(['N/https', 'N/url', 'N/currentRecord', 'N/log', 'N/runtime'], (https, url, currentRecord, log, runtime) => {

  // ─── CONFIG ────────────────────────────────────────────────────────────────
  // Can be configured in parameters in client script deployment
  const SUITELET_SCRIPT_ID  = runtime.getCurrentScript().getParameter( {name: 'custscript_fifo_suitelet_script_id'} );
  const SUITELET_DEPLOY_ID  = runtime.getCurrentScript().getParameter( {name: 'custscript_fifo_suitelet_deploy_id'} );
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Allocate quantityRequired across FIFO-sorted lots, spilling into the next if needed.
   */
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
        details: `Still short ${remaining} units after exhausting all YYWW lots`,
      });
    }

    return allocations;
  };

  /**
   * Call the Suitelet synchronously to get FIFO lots for a given item + location.
   */
  const fetchFifoLots = (itemId, locationId) => {
    const suiteletUrl = url.resolveScript({
      scriptId:   SUITELET_SCRIPT_ID,
      deploymentId: SUITELET_DEPLOY_ID,
      returnExternalUrl: false,
      params: {
        itemId,
        ...(locationId ? { locationId } : {}),
      },
    });

    const response = https.get({ url: suiteletUrl });

    if (response.code !== 200) {
      throw new Error(`Suitelet returned HTTP ${response.code}`);
    }

    const parsed = JSON.parse(response.body);

    if (parsed.error) {
      throw new Error(`Suitelet error: ${parsed.error}`);
    }

    return parsed.lots || [];
  };

  // ─── MAIN ──────────────────────────────────────────────────────────────────

  const pageInit = (context) => {
    // Only run on new Item Fulfillment creation
    if (context.mode !== 'create') return;

    const rec      = context.currentRecord;
    const numLines = rec.getLineCount({ sublistId: 'item' });

    log.audit({ title: 'fifo_lot_client pageInit', details: `Processing ${numLines} lines` });

    for (let i = 0; i < numLines; i++) {
      try {
        const itemIsFulfilled = rec.getSublistValue({
          sublistId: 'item',
          fieldId:   'itemreceive',
          line: i,
        });
        if (!itemIsFulfilled) continue;

        const itemId     = rec.getSublistValue({ sublistId: 'item', fieldId: 'item',     line: i });
        const locationId = rec.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
        const qtyToFulfill = parseFloat(
          rec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }) || 0
        );

        if (!itemId || qtyToFulfill <= 0) continue;

        // Fetch FIFO lots from the Suitelet
        const fifoLots = fetchFifoLots(itemId, locationId);

        if (!fifoLots.length) {
          log.audit({ title: 'No YYWW lots found', details: `Item: ${itemId}, Location: ${locationId}` });
          continue;
        }

        const allocations = allocateFifo(fifoLots, qtyToFulfill);

        // Select the item line before accessing its subrecord
        rec.selectLine({ sublistId: 'item', line: i });

        // Access the Inventory Detail subrecord
        const inventoryDetail = rec.getCurrentSublistSubrecord({
          sublistId: 'item',
          fieldId:   'inventorydetail',
        });
        if (!inventoryDetail) continue;

        const existingLines = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });

        // Write each FIFO allocation
        allocations.forEach((alloc, j) => {
          if (j >= existingLines) {
            inventoryDetail.insertLine({ sublistId: 'inventoryassignment', line: j });
          }

          inventoryDetail.setSublistValue({
            sublistId: 'inventoryassignment',
            fieldId:   'receiptinventorynumber',
            line: j,
            value:     alloc.lotNumber,
          });

          inventoryDetail.setSublistValue({
            sublistId: 'inventoryassignment',
            fieldId:   'quantity',
            line: j,
            value:     alloc.quantity,
          });

          log.debug({
            title: 'Lot assigned',
            details: `Line ${i} → Lot ${alloc.lotNumber}, Qty ${alloc.quantity}`,
          });
        });

        // Remove leftover pre-populated lines
        for (let k = existingLines - 1; k >= allocations.length; k--) {
          inventoryDetail.removeLine({ sublistId: 'inventoryassignment', line: k });
        }

        // Commit the line after modifying its subrecord
        rec.commitLine({ sublistId: 'item' });

      } catch (lineError) {
        log.error({ title: `Error on line ${i}`, details: lineError.message });
      }
    }
  };

  return { pageInit: pageInit };
});
