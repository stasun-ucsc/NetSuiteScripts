/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * Script: fifo_lot_client.js
 * Description: Handles the FIFO Fulfill button click on the Sales Order.
 *              Calls the FIFO Fulfill Suitelet with the current Sales Order ID.
 */

define(['N/currentRecord', 'N/url', 'N/runtime', 'N/ui/dialog', 'N/log'], (currentRecord, url, runtime, dialog, log) => {

  const pageInit = (context) => {
    // Check if we were redirected back from the Suitelet with an error
    log.debug('Page Init', 'Client script activated');
    const urlParams = new URLSearchParams(window.location.search);
    const fifoError = urlParams.get('custparam_fifo_error');
    log.debug('Error Check', fifoError);

    if (fifoError) {
      log.debug('Alert Check', `Creating Alert Message ${decodeURIComponent(fifoError)}`);
      dialog.alert({ 
        title: 'FIFO Fulfillment Error',
        message: decodeURIComponent(fifoError)
      });
    }
  };


  const fifoFulfill = () => {
    log.debug('fifoFulfill() called', 'fifoFulfill() called');
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
      dialog.alert({ 
        title: 'An error occurred',
        message: e.message
      });
    }
  };

  return { 
    pageInit: pageInit, // pageInit required by ClientScript type
    fifoFulfill: fifoFulfill
  }
});
