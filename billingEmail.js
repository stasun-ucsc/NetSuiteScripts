/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script:      SO_EmailCheckbox_CS.js
 * Description: Sales Order Client Script
 *              When custbody7 (checkbox) is checked, looks up the customer's
 *              billing email (custentity3) and APPENDS it to the "To Be Emailed"
 *              field (netsuite built-in: email + toemail), preserving any existing
 *              email addresses. When unchecked, removes only the billing email.
 *
 * Deployment:  Sales Order — Client Script
 * Functions:   fieldChanged
 */

define(['N/record', 'N/search', 'N/currentRecord', 'N/ui/message'],
    (record, search, currentRecord, message) => {

    /**
     * Triggered whenever a field value changes on the Sales Order form.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.currentRecord - The current Sales Order record
     * @param {string} scriptContext.fieldId       - The field that just changed
     */
    const fieldChanged = (scriptContext) => {
        const { currentRecord: rec, fieldId } = scriptContext;

        // Only act when our checkbox field changes
        if (fieldId !== 'custbody7') return;

        const isChecked  = rec.getValue({ fieldId: 'custbody7' });
        const customerId = rec.getValue({ fieldId: 'entity' });

        if (isChecked) {
            // ── Checkbox turned ON ───────────────────────────────────────────
            if (!customerId) {
                alert('Please select a Customer before enabling this option.');
                rec.setValue({ fieldId: 'custbody7', value: false });
                return;
            }

            try {
                // Look up the billing email from the customer record
                const customerLookup = search.lookupFields({
                    type:    search.Type.CUSTOMER,
                    id:      customerId,
                    columns: ['custentity3']
                });

                const billingEmail = customerLookup.custentity3;

                if (!billingEmail) {
                    alert('No billing email (custentity3) found on this customer record. The "To Be Emailed" field has not been updated.');
                    return;
                }

                // Get any email(s) already in the field
                const existingEmail = rec.getValue({ fieldId: 'email' }) || '';

                // Split on semicolon delimiter and filter empty entries
                const existingList = existingEmail
                    .split(';')
                    .filter(Boolean);

                // Only append if the billing email isn't already present
                if (!existingList.includes(billingEmail)) {
                    existingList.push(billingEmail);
                    rec.setValue({
                        fieldId: 'email',
                        value:   existingList.join(';')
                    });
                }

                // Also tick the native "To Be Emailed" checkbox
                rec.setValue({ fieldId: 'tobeemailed', value: true });

            } catch (e) {
                console.error('SO_EmailCheckbox_CS | Error looking up customer email:', e);
                alert('An error occurred while retrieving the customer email. Check the browser console for details.');
            }

        } else {
            // ── Checkbox turned OFF ──────────────────────────────────────────
            // Look up the billing email so we know exactly which one to remove
            if (customerId) {
                try {
                    const customerLookup = search.lookupFields({
                        type:    search.Type.CUSTOMER,
                        id:      customerId,
                        columns: ['custentity3']
                    });

                    const billingEmail = customerLookup.custentity3;

                    if (billingEmail) {
                        const existingEmail = rec.getValue({ fieldId: 'email' }) || '';

                        // Remove only the billing email, preserve everything else
                        const updatedList = existingEmail
                            .split(';')
                            .filter(e => e && e !== billingEmail);

                        rec.setValue({ fieldId: 'email', value: updatedList.join(';') });

                        // Only uncheck "To Be Emailed" if no emails remain
                        if (updatedList.length === 0) {
                            rec.setValue({ fieldId: 'tobeemailed', value: false });
                        }
                    }
                } catch (e) {
                    console.error('SO_EmailCheckbox_CS | Error removing customer email:', e);
                }
            }
        }
    };

    // ── Export ───────────────────────────────────────────────────────────────
    return { fieldChanged };
});
