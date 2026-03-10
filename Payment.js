/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord', 'N/log'], function(record, currentRecord, log) {
    
    /**
     * Executes when the payment page loads
     * @param {Object} context
     * @param {Record} context.currentRecord - Current payment record
     * @param {string} context.mode - The mode in which the record is being accessed (create, copy, edit)
     */
    function pageInit(context) {
        try {
            var paymentRec = context.currentRecord;
            
            // Only run on create mode (new payment)
            if (context.mode !== 'create') {
                return;
            }
            
            // Get the number of lines in the Apply sublist (invoices being paid)
            var lineCount = paymentRec.getLineCount({
                sublistId: 'apply'
            });
            log.debug({
                title: 'Number of Lines',
                details: lineCount
            });
            // Only proceed if there is exactly one outstanding invoice
            if (lineCount !== 1) {
                log.debug({
                    title: 'Multiple or No Invoices',
                    details: 'Found ' + lineCount + ' outstanding invoices. Script only runs with exactly 1.'
                });
                return;
            }

            var invoiceId = paymentRec.getSublistValue({
                sublistId: 'apply',
                fieldId: 'internalid',
                line: 0
            });
            
            // Load the single invoice to get its memo
            var invoiceRec = record.load({
                type: record.Type.INVOICE,
                id: invoiceId,
                isDynamic: false
            });
            
            var invoiceMemo = invoiceRec.getValue({
                fieldId: 'otherrefnum'
            });
            
            if (invoiceMemo) {
                // Set the memo on the payment record
                paymentRec.setValue({
                    fieldId: 'memo',
                    value: invoiceMemo
                });
                
                log.debug({
                    title: 'Memo Transferred',
                    details: 'Transferred memo from Invoice ' + invoiceId + ' to Payment'
                });
            }
            
        } catch (e) {
            log.error({
                title: 'Error in pageInit',
                details: e.message
            });
            console.error('Error transferring memo: ' + e.message);
        }
    }
    
    return {
        pageInit: pageInit
    };
});