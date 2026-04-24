import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '../context/CartContext';

// ── Pure reducer behaviour ─────────────────────────────────────────────────────
// We test the reducer through the hook so it exercises the real integration,
// not an exported-but-internal function.

function wrapper({ children }) {
  return <CartProvider>{children}</CartProvider>;
}

describe('CartContext', () => {
  test('initial state has cart: null', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.cart).toBeNull();
  });

  test('SET_CART action sets cart to the dispatched payload', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const fakeCart = { items: [{ vehicleId: 'v1', addOns: [] }] };

    act(() => {
      result.current.dispatch({ type: 'SET_CART', payload: fakeCart });
    });

    expect(result.current.cart).toEqual(fakeCart);
  });

  test('SET_CART replaces the entire cart (not merged)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const cartA = { items: [{ vehicleId: 'v1' }] };
    const cartB = { items: [{ vehicleId: 'v2' }, { vehicleId: 'v3' }] };

    act(() => { result.current.dispatch({ type: 'SET_CART', payload: cartA }); });
    act(() => { result.current.dispatch({ type: 'SET_CART', payload: cartB }); });

    expect(result.current.cart.items).toHaveLength(2);
    expect(result.current.cart.items[0].vehicleId).toBe('v2');
  });

  test('CLEAR_CART resets cart to null', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.dispatch({ type: 'SET_CART', payload: { items: [{ vehicleId: 'v1' }] } });
    });
    act(() => {
      result.current.dispatch({ type: 'CLEAR_CART' });
    });

    expect(result.current.cart).toBeNull();
  });

  test('CLEAR_CART after null cart stays null (no error)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => { result.current.dispatch({ type: 'CLEAR_CART' }); });

    expect(result.current.cart).toBeNull();
  });

  test('unknown action type leaves state unchanged', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const fakeCart = { items: [] };

    act(() => { result.current.dispatch({ type: 'SET_CART', payload: fakeCart }); });
    act(() => { result.current.dispatch({ type: 'TOTALLY_UNKNOWN' }); });

    expect(result.current.cart).toEqual(fakeCart);
  });

  test('dispatch is a stable function reference across renders', () => {
    const { result, rerender } = renderHook(() => useCart(), { wrapper });
    const dispatchA = result.current.dispatch;
    rerender();
    expect(result.current.dispatch).toBe(dispatchA);
  });

  test('multiple CartProvider instances are independent', () => {
    const wrapperA = ({ children }) => <CartProvider>{children}</CartProvider>;
    const wrapperB = ({ children }) => <CartProvider>{children}</CartProvider>;

    const { result: rA } = renderHook(() => useCart(), { wrapper: wrapperA });
    const { result: rB } = renderHook(() => useCart(), { wrapper: wrapperB });

    act(() => { rA.current.dispatch({ type: 'SET_CART', payload: { items: ['A'] } }); });

    expect(rA.current.cart).toEqual({ items: ['A'] });
    expect(rB.current.cart).toBeNull(); // separate instance untouched
  });
});
