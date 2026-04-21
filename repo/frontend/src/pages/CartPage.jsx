import { useCart } from '../context/CartContext';
import { useSession } from '../context/SessionContext';
import { checkout } from '../api/cart';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CartPage() {
  const { cart, dispatch } = useCart();
  const { sessionId } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const items = cart?.items ?? [];

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const data = await checkout({ sessionId });
      dispatch({ type: 'CLEAR_CART' });
      navigate('/checkout', { state: { orders: data.orders } });
    } catch (err) {
      setError(err.response?.data?.error || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="page">
        <h1>Cart</h1>
        <p className="empty">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Cart</h1>
      <div className="cart-list">
        {items.map((item, i) => (
          <div key={item.vehicleId ?? i} className="cart-item">
            <div className="cart-item-id">Vehicle: {item.vehicleId}</div>
            <div className="cart-item-meta">
              <span>Supplier: {item.supplier}</span>
              <span>Warehouse: {item.warehouseLocation}</span>
              <span>Turnaround: {item.turnaroundTime}d</span>
            </div>
            {item.addOns?.length > 0 && (
              <div className="cart-item-addons">Add-ons: {item.addOns.join(', ')}</div>
            )}
          </div>
        ))}
      </div>
      {error && <div className="error-msg">{error}</div>}
      <button className="btn btn-primary btn-lg" disabled={loading} onClick={handleCheckout}>
        {loading ? 'Processing…' : `Checkout (${items.length} item${items.length !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}
