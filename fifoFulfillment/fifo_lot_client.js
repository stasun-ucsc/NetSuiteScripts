/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * Script: fifo_lot_client.js
 * Description: Handles the FIFO Fulfill button click on the Sales Order.
 *              Calls the FIFO Fulfill Suitelet with the current Sales Order ID.
 */

define(['N/currentRecord', 'N/url', 'N/https', 'N/log'], (currentRecord, url, https, log) => {

  const fifoFulfill = () => {
    const rec   = currentRecord.get();
    const soId  = rec.id;

    if (!soId) {
      alert('Could not determine Sales Order ID. Please try again.');
      return;
    }

    // Confirm before proceeding
    const confirmed = confirm('Create Item Fulfillment with FIFO lot numbers?');
    if (!confirmed) return;

    try {
      const script = runtime.getCurrentScript();
      const SUITELET_SCRIPT_ID = script.getParameter({ name: 'custscript_fifo_suitelet_script_id' });
      const SUITELET_DEPLOY_ID = script.getParameter({ name: 'custscript_fifo_suitelet_deploy_id' });

      const suiteletUrl = url.resolveScript({
        scriptId:          SUITELET_SCRIPT_ID,
        deploymentId:      SUITELET_DEPLOY_ID,
        returnExternalUrl: false,
        params:            { soId: soId },
      });

      // Redirect the user to the Suitelet — it will process and redirect to the fulfillment
      window.location.href = suiteletUrl;

    } catch (e) {
      log.error({ title: 'fifoFulfill error', details: e.message });
      alert('An error occurred: ' + e.message);
    }
  };

  return { pageInit: function() {} }; // pageInit required by ClientScript type
});
