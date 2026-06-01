import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, test, expect } from "vitest";
import PaymentPage from "../PaymentPage";

test("calls handlePayment and createUpiQr when buttons clicked", async () => {
  const handlePayment = vi.fn();
  const createUpiQr = vi.fn();

  const props = {
    selectedCentre: { name: "Test Centre", upiId: "test@upi" },
    documentName: "MyDoc.pdf",
    pages: 2,
    copies: 1,
    backendPrice: null,
    order: { backendId: 123, amount: 50 },
    handlePayment,
    createUpiQr,
    paymentLoading: false,
    paymentError: "",
  };

  render(<PaymentPage {...props} />);

  const payBtn = screen.getByRole("button", { name: /pay online/i });
  fireEvent.click(payBtn);
  expect(handlePayment).toHaveBeenCalled();

  const upiBtn = screen.getByRole("button", { name: /create upi payment link/i });
  fireEvent.click(upiBtn);
  expect(createUpiQr).toHaveBeenCalled();
});
