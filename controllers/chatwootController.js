const axios = require('axios');

// Chatwoot API Configuration
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || "https://chatwoot.crmtmlmart.online/api/v1";
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || 1;
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN || "aTgybf5Edtgi2Yc2TFhak9YM";

/**
 * Fetch conversations from Chatwoot API
 * Proxy endpoint to avoid CORS issues
 * Supports fetching all pages when fetchAll=true
 */
const getChatwootConversations = async (req, res) => {
  try {
    const { status, assignee_type, page = 1, fetchAll } = req.query;

    console.log('Chatwoot API request params:', { status, assignee_type, page, fetchAll, query: req.query });

    // If fetchAll is true, fetch all pages
    if (fetchAll === 'true' || fetchAll === true || fetchAll === '1') {
      console.log('🔄 FetchAll mode: Fetching all conversations...');
      let allConversations = [];
      let currentPage = 1;
      let hasMore = true;
      let meta = null;
      let totalCount = null;
      let itemsPerPage = 25; // Default Chatwoot page size

      while (hasMore) {
        const params = {
          page: currentPage,
        };

        if (status) {
          params.status = status;
        }

        if (assignee_type) {
          params.assignee_type = assignee_type;
        }

        console.log(`Fetching Chatwoot conversations page ${currentPage}...`);

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

        const responseData = response.data;
        let pageConversations = [];
        
        console.log(`Page ${currentPage} response structure:`, {
          hasData: !!responseData,
          hasDataData: !!responseData?.data,
          hasPayload: !!responseData?.data?.payload,
          isArray: Array.isArray(responseData),
          keys: responseData ? Object.keys(responseData) : []
        });
        
        // Handle different response structures
        if (responseData && responseData.data && responseData.data.payload) {
          pageConversations = responseData.data.payload || [];
          if (!meta) {
            meta = responseData.data.meta || {};
            totalCount = meta.all_count || meta.total || null;
          }
        } else if (responseData && responseData.payload) {
          pageConversations = responseData.payload || [];
          if (!meta) {
            meta = responseData.meta || {};
            totalCount = meta.all_count || meta.total || null;
          }
        } else if (Array.isArray(responseData)) {
          // Direct array response
          pageConversations = responseData;
        } else if (responseData && Array.isArray(responseData.data)) {
          // Sometimes payload is directly in data
          pageConversations = responseData.data;
        }

        // Update items per page based on first page
        if (currentPage === 1 && pageConversations.length > 0) {
          itemsPerPage = pageConversations.length;
        }

        console.log(`Page ${currentPage}: Fetched ${pageConversations.length} conversations`);

        allConversations = allConversations.concat(pageConversations);

        // Check if there are more pages
        // Use total count if available, otherwise check if we got a full page
        if (totalCount && currentPage === 1) {
          const estimatedPages = Math.ceil(totalCount / itemsPerPage);
          console.log(`📊 Total count: ${totalCount}, Items per page: ${itemsPerPage}, Estimated pages: ${estimatedPages}`);
        }

        // Continue fetching if:
        // 1. We got conversations on this page, AND
        // 2. We haven't reached the total count yet (if we know it)
        if (totalCount) {
          hasMore = allConversations.length < totalCount && pageConversations.length > 0;
          console.log(`Page ${currentPage}: ${pageConversations.length} conversations, Total so far: ${allConversations.length}/${totalCount}, Has more: ${hasMore}`);
        } else {
          // Fallback: continue as long as we get a full page of conversations
          // Stop if we get less than itemsPerPage (likely last page)
          hasMore = pageConversations.length >= itemsPerPage;
          console.log(`Page ${currentPage}: ${pageConversations.length} conversations (expected ${itemsPerPage}), Total so far: ${allConversations.length}, Has more: ${hasMore}`);
        }
        
        currentPage++;

        // Safety limit: don't fetch more than 200 pages (to prevent infinite loops)
        if (currentPage > 200) {
          console.warn('Reached maximum page limit (200)');
          hasMore = false;
        }

        // Small delay to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Fetched ${allConversations.length} conversations across ${currentPage - 1} pages`);

      // Return in the same structure as single page fetch for consistency
      res.json({
        success: true,
        data: {
          data: {
            payload: allConversations,
            meta: meta || {}
          },
          payload: allConversations, // Also include at top level for fallback
          meta: meta || {}
        },
      });
      return;
    }

    // Normal single-page fetch
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


