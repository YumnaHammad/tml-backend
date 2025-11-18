const express = require("express");
const {
  createPostExOrder,
  getAllPostExOrders,
  getPostExOrderById,
  updatePostExOrderStatus,
  deletePostExOrder,
  fetchPostExOrdersFromAPI,
} = require("../controllers/postExController");
const { optionalAuthenticate } = require("../middleware/auth");

const router = express.Router();

// Fetch orders from PostEx API (external API call)
router.get("/api/fetch", optionalAuthenticate, fetchPostExOrdersFromAPI);

// Get all PostEx orders (from local database)
router.get("/", optionalAuthenticate, getAllPostExOrders);

// Get PostEx order by ID
router.get("/:id", optionalAuthenticate, getPostExOrderById);

// Create a new PostEx order
router.post("/", optionalAuthenticate, createPostExOrder);

// Update PostEx order status
router.patch("/:id/status", optionalAuthenticate, updatePostExOrderStatus);

// Delete PostEx order
router.delete("/:id", optionalAuthenticate, deletePostExOrder);

module.exports = router;



