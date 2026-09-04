function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens the real Razorpay (test mode) checkout popup for a payment the
 * server already created via createRazorpayOrder(). This is what actually
 * fires when the customer taps "Pay now" on a payment card in the chat —
 * the agent's place_order / pay_for_order tools produce the {order_id,
 * key_id, amount} payload; this function is what turns that into an
 * on-screen Razorpay window.
 */
export async function openRazorpayCheckout({ payment, onSuccess, onFailed, onDismiss }) {
  const ok = await loadRazorpayScript();
  if (!ok) {
    onFailed?.('Payment page could not load. Please check your connection and try again.');
    return;
  }
  const rzp = new window.Razorpay({
    key: payment.key_id,
    amount: payment.amount,
    currency: 'INR',
    name: 'HYDR',
    description: 'HYDR order',
    order_id: payment.order_id,
    handler: (response) => onSuccess?.(response),
    modal: { ondismiss: () => onDismiss?.() },
    theme: { color: '#1c1712' },
  });
  rzp.on('payment.failed', () => onFailed?.('Payment was declined. You can retry from this order.'));
  rzp.open();
}
