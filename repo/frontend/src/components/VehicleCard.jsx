import { useState } from 'react';
import { addToCart } from '../api/cart';
import { useSession } from '../context/SessionContext';
import { useCart } from '../context/CartContext';

const ADDON_LABELS = {
  inspection_package: 'Inspection Package',
  extended_warranty:  'Extended Warranty',
};

export default function VehicleCard({ vehicle }) {
  const { sessionId } = useSession();
  const { dispatch } = useCart();
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  function toggleAddOn(key) {
    setSelectedAddOns(prev =>
      prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key]
    );
  }

  async function handleAdd() {
    setStatus('loading');
    setError(null);
    try {
      const data = await addToCart({ sessionId, vehicleId: vehicle._id, addOns: selectedAddOns });
      dispatch({ type: 'SET_CART', payload: data.cart });
      setStatus('added');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add to cart');
      setStatus('idle');
    }
  }

  const unavailable = vehicle.status !== 'available';

  return (
    <div className={`vehicle-card${unavailable ? ' unavailable' : ''}`}>
      <div className="vehicle-card-header">
        <span className="vehicle-title">{vehicle.year} {vehicle.make} {vehicle.model}</span>
        <span className="vehicle-price">${vehicle.price?.toLocaleString()}</span>
      </div>
      <div className="vehicle-meta">
        <span>{vehicle.mileage?.toLocaleString()} mi</span>
        <span>{vehicle.region}</span>
        <span className={`status-badge status-${vehicle.status}`}>{vehicle.status}</span>
      </div>
      {!unavailable && (
        <div className="vehicle-addons">
          {Object.entries(ADDON_LABELS).map(([key, label]) => (
            <label key={key} className="addon-label">
              <input
                type="checkbox"
                checked={selectedAddOns.includes(key)}
                onChange={() => toggleAddOn(key)}
              />
              {label}
            </label>
          ))}
        </div>
      )}
      {error && <div className="error-msg">{error}</div>}
      <button
        className="btn btn-primary"
        disabled={unavailable || status === 'loading'}
        onClick={handleAdd}
      >
        {status === 'loading' ? 'Adding…' : status === 'added' ? 'Added!' : 'Add to Cart'}
      </button>
    </div>
  );
}
