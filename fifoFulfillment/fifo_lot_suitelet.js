/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Script: fifo_lot_suitelet.js
 * Description: Accepts itemId + locationId as query params, returns FIFO-sorted
 *              YYWW lots with available quantities as JSON.
 */

define(['N/search', 'N/log'], (search, log) => {

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  const yywwToSortKey = (yyww) => parseInt(yyww, 10);
  const isYYWW = (lotNumber) => /^\d{4}$/.test(lotNumber);

  const getFifoLots = (itemId, locationId) => {
    const filters = [
      search.createFilter({ name: 'item', operator: search.Operator.ANYOF, values: itemId }),
      search.createFilter({ name: 'quantityonhand', join: 'inventoryNumber', operator: search.Operator.GREATERTHAN, values: 0 }),
    ];

    if (locationId) {
      filters.push(
        search.createFilter({ name: 'location', operator: search.Operator.ANYOF, values: locationId })
      );
    }

    const columns = [
      search.createColumn({ name: 'inventorynumber' }),
      search.createColumn({ name: 'quantityonhand', join: 'inventoryNumber' }),
    ];

    const lotSearch = search.create({
      type: search.Type.INVENTORY_BALANCE,
      filters,
      columns,
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

    return lots;
  };

  // ─── MAIN ──────────────────────────────────────────────────────────────────

  const onRequest = (context) => {
    const { request, response } = context;

    response.setHeader({ name: 'Content-Type', value: 'application/json' });

    try {
      const itemId     = request.parameters.itemId;
      const locationId = request.parameters.locationId || null;

      if (!itemId) {
        response.write(JSON.stringify({ error: 'Missing required parameter: itemId' }));
        return;
      }

      const lots = getFifoLots(itemId, locationId);

      response.write(JSON.stringify({ success: true, lots }));

    } catch (e) {
      log.error({ title: 'fifo_lot_suitelet error', details: e.message });
      response.write(JSON.stringify({ error: e.message }));
    }
  };

  return { onRequest };
});
