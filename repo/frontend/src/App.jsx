import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import SearchPage    from './pages/SearchPage';
import CartPage      from './pages/CartPage';
import CheckoutPage  from './pages/CheckoutPage';
import DocumentsPage from './pages/DocumentsPage';
import AdminPage     from './pages/AdminPage';
import FinancePage   from './pages/FinancePage';
import PrivacyPage   from './pages/PrivacyPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <CartProvider>
          <Layout>
            <Routes>
              <Route path="/"          element={<SearchPage />} />
              <Route path="/cart"      element={<CartPage />} />
              <Route path="/checkout"  element={<CheckoutPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/admin"     element={<AdminPage />} />
              <Route path="/finance"   element={<FinancePage />} />
              <Route path="/privacy"   element={<PrivacyPage />} />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </CartProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
