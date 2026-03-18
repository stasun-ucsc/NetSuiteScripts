/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 *
 * Script: fifo_lot_ue.js
 * Description: Adds a custom FIFO Fulfill button to the Sales Order form.
 *              The button triggers fifo_lot_client.js which calls the Suitelet.
 */

define(['N/ui/serverWidget', 'N/log'], (serverWidget, log) => {

  const beforeLoad = (context) => {
    // Only show on existing Sales Orders, not on create
    if (context.type === context.UserEventType.CREATE) return;

    // Only show when the record is in view mode
    if (context.type !== context.UserEventType.VIEW) return;

    const form = context.form;

    form.addButton({
      id:       'custpage_fifo_fulfill_btn',
      label:    'FIFO Fulfill',
      functionName: 'fifoFulfill()', // called from fifo_fulfill_client.js
    });

    // Attach the client script to the form so the button function is available
    form.clientScriptModulePath = './fifo_lot_client.js';

    log.audit({ title: 'fifo_lot_ue', details: 'FIFO Fulfill button added to Sales Order' });
  };

  return { beforeLoad: beforeLoad };
});
