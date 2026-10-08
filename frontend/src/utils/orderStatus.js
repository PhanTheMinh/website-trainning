export const orderStatuses = { pending: 'Pending confirmation', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }
export const financialStatuses = { unpaid: 'Unpaid', paid: 'Paid' }
export const fulfillmentStatuses = { unfulfilled: 'Not started', processing: 'Preparing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' }
export const orderActions = {
  confirm: { label: 'Confirm order', description: 'Accept this order for your shop to prepare.' },
  processing: { label: 'Start preparing', description: 'Mark this order as being prepared and packed.' },
  shipped: { label: 'Mark as shipped', description: 'Confirm that this order has been handed to the delivery service.' },
  delivered: { label: 'Mark as delivered', description: 'Confirm that the customer has received this order. Payment remains separate.' },
  'mark-paid': { label: 'Record COD payment', description: 'Confirm that the full order amount has been collected. This completes the delivered order.' },
  cancel: { label: 'Cancel order', description: 'Cancel this order before shipment and return its quantities to stock.' }
}
export const orderDate = value => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—'
