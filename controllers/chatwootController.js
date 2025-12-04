const axios = require('axios');

// Chatwoot API Configuration
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || "https://chatwoot.crmtmlmart.online/api/v1";
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || 1;
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN || "aTgybf5Edtgi2Yc2TFhak9YM";

/**
 * Fetch conversations from Chatwoot API
 * Proxy endpoint to avoid CORS issues
 */
const getChatwootConversations = async (req, res) => {
  try {
    const { status, assignee_type, page = 1 } = req.query;

    // Build query params
    const params = {
      page: parseInt(page),
    };

    if (status) {
      params.status = status;
    }

    if (assignee_type) {
      params.assignee_type = assignee_type; // mine, assigned, unassigned
    }

    console.log('Fetching Chatwoot conversations:', {
      url: `${CHATWOOT_API_URL}/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      params,
      hasToken: !!CHATWOOT_API_TOKEN
    });

    const response = await axios.get(
      `${CHATWOOT_API_URL}/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
          "Content-Type": "application/json",
        },
        params,
      }
    );

    console.log('Chatwoot API response status:', response.status);
    console.log('Chatwoot API response data structure:', {
      hasData: !!response.data,
      hasDataData: !!response.data?.data,
      keys: response.data ? Object.keys(response.data) : []
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Error fetching Chatwoot conversations:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || error.response.data?.error || "Failed to fetch conversations",
        details: error.response.data,
        status: error.response.status
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        success: false,
        error: "Cannot connect to Chatwoot API. Please check the API URL and network connection.",
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch conversations from Chatwoot",
      message: error.message,
      code: error.code
    });
  }
};

/**
 * Get single conversation by ID
 */
const getChatwootConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(
      `${CHATWOOT_API_URL}/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${id}`,
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Error fetching Chatwoot conversation:", error);
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || "Failed to fetch conversation",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch conversation from Chatwoot",
      message: error.message,
    });
  }
};

module.exports = {
  getChatwootConversations,
  getChatwootConversationById,
};


