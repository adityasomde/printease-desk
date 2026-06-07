import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, test, expect } from "vitest";
import PaymentPage from "../PaymentPage";

test("shows manual payment request and calls handlePayment", async () => {
  const handlePayment = vi.fn();
  const setPaymentMethod = vi.fn();

  const props = {
    selectedCentre: { name: "Test Centre", upiId: "test@upi", upiQrImageUrl: "https://example.com/qr.png" },
    currentUser: { id: "user-1", role: "user", name: "Test User" },
    documentName: "MyDoc.pdf",
    pages: 2,
    copies: 1,
    backendPrice: null,
    order: { backendId: 123, amount: 50 },
    paymentMethod: "manual",
    setPaymentMethod,
    handlePayment,
    paymentLoading: false,
    paymentError: "",
  };

  render(<PaymentPage {...props} />);

  expect(screen.getAllByText(/test@upi/i).length).toBeGreaterThan(0);
  expect(screen.getByAltText(/centre upi qr/i).getAttribute("src")).toBe(props.selectedCentre.upiQrImageUrl);

  const requestBtn = screen.getByRole("button", { name: /request payment/i });
  fireEvent.click(requestBtn);
  expect(handlePayment).toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /pay online/i }));
  expect(setPaymentMethod).toHaveBeenCalledWith("razorpay");

  fireEvent.click(screen.getByRole("button", { name: /upi qr/i }));
  expect(setPaymentMethod).toHaveBeenCalledWith("upi_qr");
});

test("shows Razorpay payment button when online method is selected", async () => {
  const handlePayment = vi.fn();

  render(
    <PaymentPage
      selectedCentre={{ name: "Test Centre", upiId: "test@upi" }}
      currentUser={{ id: "user-1", role: "user", name: "Test User" }}
      documentName="MyDoc.pdf"
      pages={2}
      copies={1}
      backendPrice={null}
      order={{ backendId: 123, amount: 50 }}
      paymentMethod="razorpay"
      setPaymentMethod={vi.fn()}
      handlePayment={handlePayment}
      paymentLoading={false}
      paymentError=""
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /^pay ₹50\.00$/i }));
  expect(handlePayment).toHaveBeenCalled();
});
