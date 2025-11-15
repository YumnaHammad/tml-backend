const express = require("express");
const {
  createSalesOrder,
  getAllSalesOrders,
  getApprovedSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  updateSalesOrderStatus,
  dispatchSalesOrder,
  markDeliveryCompleted,
  deleteSalesOrder,
  updateQCStatus,
  checkDuplicatePhoneNumbers,
  checkPhoneNumberDuplicates,
} = require("../controllers/salesController");
const { optionalAuthenticate } = require("../middleware/auth");

const router = express.Router();

// Routes with optional authentication
router.get("/", optionalAuthenticate, getAllSalesOrders);
router.get("/approved",optionalAuthenticate, getApprovedSalesOrders);
router.get(
  "/check-duplicate-phones",
  optionalAuthenticate,
  checkDuplicatePhoneNumbers
);
router.get("/check-phone", optionalAuthenticate, checkPhoneNumberDuplicates);
router.post("/", optionalAuthenticate, createSalesOrder);
// More specific routes must come before /:id routes
router.put("/:id", optionalAuthenticate, updateSalesOrder);
router.put("/:id/status", optionalAuthenticate, updateSalesOrderStatus);
router.patch("/:id/status", optionalAuthenticate, updateSalesOrderStatus);
router.put("/:id/qc-status", optionalAuthenticate, updateQCStatus);
router.post("/:id/dispatch", optionalAuthenticate, dispatchSalesOrder);
router.post("/:id/deliver", optionalAuthenticate, markDeliveryCompleted);
router.get("/:id", optionalAuthenticate, getSalesOrderById);
router.delete("/:id", optionalAuthenticate, deleteSalesOrder);

module.exports = router;
