import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { processPayment } from '../api/payments';
import { transitionOrder } from '../api/orders';
import { getInvoicePreview } from '../api/finance';

const PAYMENT_METHODS = ['cash', 'cashiers_check', 'inhouse_financing'];

export default function CheckoutPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const orders = state?.orders ?? [];

  const [selectedOrder, setSelectedOrder] = useState(orders[0]?._id ?? null);
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [payStatus, setPayStatus] = useState('idle');
  const [error, setError] = useState(null);

  const [taxState, setTaxState] = useState('');
  const [taxCounty, setTaxCounty] = useState('');

  if (orders.length === 0) {
    return (
      <div className="page">
        <h1>Checkout</h1>
        <p className="empty">No orders to display. <button className="btn-link" onClick={() => navigate('/')}>Search vehicles</button></p>
      </div>
    );
  }

  async function loadInvoice(orderId) {
    if (!taxState.trim() || !taxCounty.trim()) return;
    setInvoiceLoading(true);
    setInvoice(null);
    try {
      const data = await getInvoicePreview(orderId, taxState.trim(), taxCounty.trim());
      setInvoice(data.preview);
    } catch {
      setInvoice(null);
    } finally {
      setInvoiceLoading(false);
    }
  }

  function handleOrderSelect(id) {
    setSelectedOrder(id);
    loadInvoice(id);
    setError(null);
  }

  async function handlePay() {
    if (!selectedOrder || !amount) return;
    setPayStatus('loading');
    setError(null);
    try {
      await processPayment({ orderId: selectedOrder, method, amount: parseFloat(amount) });
      await transitionOrder(selectedOrder, { toState: 'reserved' });
      setPayStatus('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed');
      setPayStatus('idle');
    }
  }

  return (
    <div className="page">
      <h1>Checkout</h1>
      <div className="checkout-layout">
        <div className="order-list">
          <h2>Orders</h2>
          {orders.map(order => (
            <div
              key={order._id}
              className={`order-card${selectedOrder === order._id ? ' selected' : ''}`}
              onClick={() => handleOrderSelect(order._id)}
            >
              <div className="order-id">Order #{order._id.slice(-6)}</div>
              <div className="order-meta">
                <span>{order.supplier}</span>
                <span>{order.items?.length} item{order.items?.length !== 1 ? 's' : ''}</span>
                <span className={`status-badge status-${order.status}`}>{order.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="payment-panel">
          <div className="tax-location">
            <h3>Tax Location</h3>
            <input
              placeholder="State (e.g. CA)"
              value={taxState}
              onChange={e => setTaxState(e.target.value)}
            />
            <input
              placeholder="County (e.g. Los Angeles)"
              value={taxCounty}
              onChange={e => setTaxCounty(e.target.value)}
            />
            <button
              className="btn"
              disabled={!taxState.trim() || !taxCounty.trim() || !selectedOrder}
              onClick={() => loadInvoice(selectedOrder)}
            >
              Preview Invoice
            </button>
          </div>

          {invoiceLoading && <div className="loading">Loading invoice…</div>}
          {invoice && (
            <div className="invoice-preview">
              <h3>Invoice Preview</h3>
              <div>Subtotal: ${invoice.subtotal?.toLocaleString()}</div>
              <div>Tax: ${invoice.tax?.totalTaxAmount?.toLocaleString()}</div>
              <div className="invoice-total">Total: ${invoice.total?.toLocaleString()}</div>
            </div>
          )}

          {payStatus === 'done' ? (
            <div className="success-msg">Payment recorded. Order reserved.</div>
          ) : (
            <>
              <h2>Payment</h2>
              <select value={method} onChange={e => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0"
              />
              {error && <div className="error-msg">{error}</div>}
              <button
                className="btn btn-primary btn-lg"
                disabled={payStatus === 'loading' || !amount || !selectedOrder}
                onClick={handlePay}
              >
                {payStatus === 'loading' ? 'Processing…' : 'Pay Now'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
