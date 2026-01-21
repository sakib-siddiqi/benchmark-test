# Promotion Coupon Endpoint - Pseudocode

## Overview

This document provides **language-agnostic pseudocode** for implementing the Promotion Coupon Endpoint in any programming language or framework. The pseudocode follows the exact logic flow of the Node.js/Express implementation.

## Table of Contents
1. [High-Level Algorithm](#high-level-algorithm)
2. [Data Structures](#data-structures)
3. [Main Controller Function](#main-controller-function)
4. [Helper Functions](#helper-functions)
5. [Database Queries](#database-queries)
6. [Caching Layer](#caching-layer)
7. [Tracking System](#tracking-system)
8. [Template Rendering](#template-rendering)
9. [Client-Side Logic](#client-side-logic)
10. [Error Handling](#error-handling)
11. [Implementation Examples](#implementation-examples)

---

## High-Level Algorithm

```
FUNCTION handleCouponRequest(request, response):
    // 1. Extract coupon code from URL parameter
    coupon = extractPathParameter(request, "coupon")

    // 2. Try to get affiliate link from cache
    affiliateLink = getCachedAffiliateLink(coupon)

    // 3. If cache miss, query database
    IF affiliateLink is NULL:
        affiliateLink = queryAffiliateLinkFromDatabase(coupon)

        // 4. Cache the result if found
        IF affiliateLink is not NULL:
            cacheAffiliateLink(coupon, affiliateLink, TTL=1800)
    END IF

    // 5. Handle invalid coupon
    IF affiliateLink is NULL OR affiliateLink.campaign is NULL:
        RETURN redirect(response, "/pricing")
    END IF

    // 6. Extract user's country from request header
    country = extractHeader(request, "cf-ipcountry") OR "UNKNOWN"

    // 7. Create click tracking record (non-blocking)
    trackClickAsync({
        country: country,
        affiliate_id: affiliateLink.affiliate_id,
        campaign_id: affiliateLink.campaign_id,
        link_id: affiliateLink.id,
        status: "CLICK"
    })

    // 8. Render redirect template with data
    RETURN renderTemplate(response, "coupon_redirect", {
        data: affiliateLink,
        country: country
    })

CATCH error:
    RETURN handleError(response, error)
END FUNCTION
```

---

## Data Structures

### AffiliateLink
```
STRUCTURE AffiliateLink:
    id: INTEGER
    coupon: STRING (max 20 chars)
    affiliate_id: INTEGER
    campaign_id: INTEGER
    campaign: Campaign (nested object)
    created_at: TIMESTAMP
    updated_at: TIMESTAMP
END STRUCTURE
```

### Campaign
```
STRUCTURE Campaign:
    id: INTEGER
    title: STRING
    url: STRING (destination URL)
    image_id: INTEGER (nullable)
    description: TEXT
    start_on: DATETIME
    end_on: DATETIME
    package_id: INTEGER
    commission_type: ENUM("PERCENTAGE", "FIXED")
    commission: INTEGER (0-999)
    approval: ENUM("ACTIVE", "INACTIVE")
    status: ENUM("ACTIVE", "INACTIVE")
    created_at: TIMESTAMP
    updated_at: TIMESTAMP
END STRUCTURE
```

### ClickTrackingEvent
```
STRUCTURE ClickTrackingEvent:
    country: STRING (max 60 chars)
    affiliate_id: INTEGER
    campaign_id: INTEGER
    link_id: INTEGER
    status: ENUM("CLICK", "CONVERSION")
    payment: ENUM("HOLD", "RELEASE") (default: "HOLD")
    amount: FLOAT (default: 0.0)
END STRUCTURE
```

---

## Main Controller Function

```
FUNCTION handlePromotionCouponRequest(request, response):
    /*
     * Main entry point for GET /api/promotion/coupon/:coupon
     * Handles affiliate coupon validation, tracking, and redirection
     */

    BEGIN_TRY:
        // STEP 1: Extract coupon code
        coupon = request.pathParameters["coupon"]
        IF coupon is NULL OR coupon is EMPTY:
            RETURN redirect(response, "/pricing")
        END IF

        // STEP 2: Generate cache key
        cacheKey = "affiliate:link:" + coupon

        // STEP 3: Attempt cache retrieval
        affiliateLink = NULL

        IF cacheClient.isConnected() AND cacheClient.isHealthy():
            TRY:
                cachedData = cacheClient.getWithTimeout(
                    key: cacheKey,
                    timeout: 1000 milliseconds
                )

                IF cachedData is not NULL:
                    affiliateLink = parseJSON(cachedData)
                    logInfo("Cache hit for coupon: " + coupon)
                END IF

            CATCH cacheError:
                logWarning("Cache read failed: " + cacheError.message)
                // Continue without cache
            END TRY
        END IF

        // STEP 4: Query database on cache miss
        IF affiliateLink is NULL:
            logInfo("Cache miss for coupon: " + coupon)

            affiliateLink = database.query(
                table: "affiliate_links",
                where: {
                    coupon: coupon
                },
                include: {
                    table: "campaigns",
                    alias: "campaign",
                    where: {
                        AND: [
                            { start_on: LESS_THAN(currentDateTime()) },
                            { end_on: GREATER_THAN(currentDateTime()) }
                        ]
                    }
                }
            )

            // STEP 5: Cache the result if found
            IF affiliateLink is not NULL AND cacheClient.isConnected():
                TRY:
                    cacheClient.setWithTimeout(
                        key: cacheKey,
                        value: toJSON(affiliateLink),
                        ttl: 1800,
                        timeout: 1000 milliseconds
                    )
                    logInfo("Cached affiliate link: " + coupon)

                CATCH cacheError:
                    logWarning("Cache write failed: " + cacheError.message)
                    // Continue without caching
                END TRY
            END IF
        END IF

        // STEP 6: Handle invalid or expired coupon
        IF affiliateLink is NULL OR affiliateLink.id is NULL:
            logInfo("Invalid coupon: " + coupon)
            RETURN redirect(response, "/pricing")
        END IF

        // STEP 7: Extract country from request
        country = request.headers["cf-ipcountry"]
        IF country is NULL OR country is EMPTY:
            country = "UNKNOWN"
        END IF

        // STEP 8: Create tracking event (async, non-blocking)
        clickEvent = new ClickTrackingEvent {
            country: country,
            affiliate_id: affiliateLink.affiliate_id,
            campaign_id: affiliateLink.campaign_id,
            link_id: affiliateLink.id,
            status: "CLICK"
        }

        // Fire and forget - don't wait for completion
        executeAsync(FUNCTION:
            TRY:
                database.insert("affiliate_tracking", clickEvent)
                logInfo("Click tracked for link: " + affiliateLink.id)
            CATCH trackingError:
                logError("Click tracking failed: " + trackingError.message)
            END TRY
        )

        // STEP 9: Render redirect template
        templateData = {
            data: affiliateLink,
            country: country
        }

        RETURN renderTemplate(
            response: response,
            template: "coupon_redirect",
            data: templateData,
            status: 200
        )

    CATCH error:
        logError("Coupon request failed: " + error.message)
        statusCode = extractHTTPStatusCode(error) OR 500
        errorMessage = extractErrorMessage(error)

        RETURN sendJSONError(
            response: response,
            statusCode: statusCode,
            message: errorMessage
        )
    END_TRY

END FUNCTION
```

---

## Helper Functions

### Extract Path Parameter
```
FUNCTION extractPathParameter(request, paramName):
    /*
     * Safely extracts URL path parameter
     * Returns NULL if not found
     */

    IF request.pathParameters exists AND request.pathParameters[paramName] exists:
        RETURN request.pathParameters[paramName]
    ELSE:
        RETURN NULL
    END IF
END FUNCTION
```

### Extract Header
```
FUNCTION extractHeader(request, headerName):
    /*
     * Safely extracts HTTP header value
     * Returns NULL if not found
     * Header names are case-insensitive
     */

    headerNameLower = toLowerCase(headerName)

    FOR EACH header IN request.headers:
        IF toLowerCase(header.name) == headerNameLower:
            RETURN header.value
        END IF
    END FOR

    RETURN NULL
END FUNCTION
```

### Extract HTTP Status Code
```
FUNCTION extractHTTPStatusCode(error, defaultCode = 500):
    /*
     * Extracts HTTP status code from error object
     * Returns defaultCode if not found
     */

    IF error.statusCode exists AND error.statusCode is INTEGER:
        RETURN error.statusCode
    ELSE IF error.status exists AND error.status is INTEGER:
        RETURN error.status
    ELSE:
        RETURN defaultCode
    END IF
END FUNCTION
```

### Extract Error Message
```
FUNCTION extractErrorMessage(error):
    /*
     * Extracts human-readable error message
     * Falls back to generic message
     */

    IF error.message exists:
        RETURN error.message
    ELSE IF error.errors exists AND error.errors is ARRAY AND error.errors.length > 0:
        RETURN error.errors[0].message
    ELSE:
        RETURN "An unexpected error occurred"
    END IF
END FUNCTION
```

---

## Database Queries

### Query Affiliate Link with Active Campaign
```
FUNCTION queryAffiliateLinkFromDatabase(coupon):
    /*
     * Queries database for affiliate link with associated active campaign
     * Returns NULL if not found or campaign expired
     */

    currentTime = getCurrentDateTime()

    query = {
        table: "affiliate_links",
        select: ["id", "coupon", "affiliate_id", "campaign_id", "created_at", "updated_at"],
        where: {
            coupon: EQUALS(coupon)
        },
        joins: [
            {
                type: "INNER JOIN",
                table: "campaigns",
                alias: "campaign",
                on: "affiliate_links.campaign_id = campaigns.id",
                select: [
                    "id", "title", "url", "description", "start_on", "end_on",
                    "package_id", "commission_type", "commission", "approval", "status"
                ],
                where: {
                    AND: [
                        { start_on: LESS_THAN(currentTime) },
                        { end_on: GREATER_THAN(currentTime) }
                    ]
                }
            }
        ],
        limit: 1
    }

    result = database.execute(query)

    IF result.rows.length > 0:
        RETURN result.rows[0]
    ELSE:
        RETURN NULL
    END IF
END FUNCTION
```

### SQL Translation Example
```sql
-- Equivalent SQL query
SELECT
    al.id,
    al.coupon,
    al.affiliate_id,
    al.campaign_id,
    al.created_at,
    al.updated_at,
    c.id AS campaign_id,
    c.title AS campaign_title,
    c.url AS campaign_url,
    c.description AS campaign_description,
    c.start_on AS campaign_start_on,
    c.end_on AS campaign_end_on,
    c.package_id AS campaign_package_id,
    c.commission_type AS campaign_commission_type,
    c.commission AS campaign_commission,
    c.approval AS campaign_approval,
    c.status AS campaign_status
FROM affiliate_links al
INNER JOIN campaigns c ON al.campaign_id = c.id
WHERE al.coupon = ?
  AND c.start_on < NOW()
  AND c.end_on > NOW()
LIMIT 1;
```

### Insert Click Tracking Record
```
FUNCTION insertClickTracking(event):
    /*
     * Inserts click tracking record into database
     * Throws error on failure
     */

    query = {
        table: "affiliate_tracking",
        columns: {
            country: event.country,
            affiliate_id: event.affiliate_id,
            campaign_id: event.campaign_id,
            link_id: event.link_id,
            status: event.status,
            payment: "HOLD",
            amount: 0.0,
            created_at: getCurrentDateTime(),
            updated_at: getCurrentDateTime()
        }
    }

    result = database.insert(query)

    RETURN result.insertedId
END FUNCTION
```

---

## Caching Layer

### Get from Cache with Timeout
```
FUNCTION getCachedAffiliateLink(coupon):
    /*
     * Retrieves affiliate link from cache with timeout protection
     * Returns NULL on cache miss, error, or timeout
     */

    cacheKey = "affiliate:link:" + coupon
    maxWaitTime = 1000 // milliseconds

    IF NOT cacheClient.isConnected():
        logWarning("Cache client not connected")
        RETURN NULL
    END IF

    TRY:
        // Create timeout promise
        timeoutPromise = createTimeout(maxWaitTime)

        // Create cache retrieval promise
        cachePromise = cacheClient.get(cacheKey)

        // Race between cache retrieval and timeout
        result = awaitFirstResolved([cachePromise, timeoutPromise])

        IF result.source == "timeout":
            logWarning("Cache read timeout for key: " + cacheKey)
            RETURN NULL
        END IF

        IF result.value is NULL:
            // Cache miss
            RETURN NULL
        END IF

        // Parse and return cached data
        affiliateLink = parseJSON(result.value)
        RETURN affiliateLink

    CATCH error:
        logWarning("Cache read error: " + error.message)
        RETURN NULL
    END TRY
END FUNCTION
```

### Set Cache with Timeout
```
FUNCTION cacheAffiliateLink(coupon, affiliateLink, ttl):
    /*
     * Stores affiliate link in cache with TTL and timeout protection
     * Logs warning on failure but doesn't throw error
     */

    cacheKey = "affiliate:link:" + coupon
    maxWaitTime = 1000 // milliseconds

    IF NOT cacheClient.isConnected():
        logWarning("Cache client not connected, skipping cache write")
        RETURN FALSE
    END IF

    TRY:
        // Serialize data
        serializedData = toJSON(affiliateLink)

        // Create timeout promise
        timeoutPromise = createTimeout(maxWaitTime)

        // Create cache write promise
        cachePromise = cacheClient.setWithExpiry(cacheKey, serializedData, ttl)

        // Race between cache write and timeout
        result = awaitFirstResolved([cachePromise, timeoutPromise])

        IF result.source == "timeout":
            logWarning("Cache write timeout for key: " + cacheKey)
            RETURN FALSE
        END IF

        logInfo("Successfully cached affiliate link: " + coupon)
        RETURN TRUE

    CATCH error:
        logWarning("Cache write error: " + error.message)
        RETURN FALSE
    END TRY
END FUNCTION
```

### Invalidate Cache
```
FUNCTION invalidateAffiliateLinkCache(coupon = NULL):
    /*
     * Invalidates cache for specific coupon or all affiliate links
     * Called by model hooks on update/delete operations
     */

    IF NOT cacheClient.isConnected():
        RETURN
    END IF

    TRY:
        IF coupon is not NULL:
            // Invalidate specific coupon
            cacheKey = "affiliate:link:" + coupon
            cacheClient.deleteWithTimeout(cacheKey, timeout: 1000)
            logInfo("Invalidated cache for coupon: " + coupon)
        ELSE:
            // Invalidate all affiliate links (wildcard delete)
            pattern = "affiliate:link:*"
            keys = cacheClient.getKeysByPattern(pattern)

            IF keys.length > 0:
                cacheClient.deleteMultipleWithTimeout(keys, timeout: 1000)
                logInfo("Invalidated all affiliate link caches (" + keys.length + " keys)")
            END IF
        END IF

    CATCH error:
        logWarning("Cache invalidation failed: " + error.message)
    END TRY
END FUNCTION
```

### Helper: Create Timeout Promise
```
FUNCTION createTimeout(milliseconds):
    /*
     * Creates a promise that rejects after specified time
     * Used for timeout protection with Promise.race pattern
     */

    RETURN new Promise(FUNCTION:
        wait(milliseconds)
        THROW new TimeoutError("Operation timed out after " + milliseconds + "ms")
    )
END FUNCTION
```

### Helper: Await First Resolved
```
FUNCTION awaitFirstResolved(promises):
    /*
     * Returns the first promise to resolve or reject
     * Equivalent to Promise.race() in JavaScript
     */

    result = waitForFirstCompletion(promises)

    RETURN {
        source: result.promiseIndex == 0 ? "operation" : "timeout",
        value: result.value,
        error: result.error
    }
END FUNCTION
```

---

## Tracking System

### Track Click (Async)
```
FUNCTION trackClickAsync(clickEvent):
    /*
     * Records affiliate click in background (non-blocking)
     * Errors logged but don't affect main request flow
     */

    // Execute in background thread/process
    executeInBackground(FUNCTION:
        TRY:
            // Insert into database
            insertClickTracking(clickEvent)

            logInfo("Click tracked: link=" + clickEvent.link_id +
                   ", country=" + clickEvent.country)

        CATCH error:
            logError("Click tracking failed: " + error.message)
            // Don't throw - tracking failures shouldn't affect user
        END TRY
    )
END FUNCTION
```

### Batch Click Buffering (Optional High-Performance Mode)
```
FUNCTION bufferClickForBatch(clickEvent):
    /*
     * Buffers click to Redis list for bulk insertion
     * Used in high-traffic scenarios to reduce DB load
     * Currently disabled in production but available
     */

    bufferKey = "click_buffer"

    IF NOT cacheClient.isConnected():
        // Fallback to direct insert
        insertClickTracking(clickEvent)
        RETURN
    END IF

    TRY:
        // Add to Redis list
        serializedEvent = toJSON(clickEvent)
        cacheClient.listPush(bufferKey, serializedEvent)

        logDebug("Click buffered for batch insertion")

    CATCH error:
        logWarning("Click buffering failed, using direct insert: " + error.message)
        // Fallback to direct insert
        insertClickTracking(clickEvent)
    END TRY
END FUNCTION
```

### Background Job: Flush Click Buffer
```
FUNCTION flushClickBuffer():
    /*
     * Background job that flushes buffered clicks to database
     * Runs every N seconds (e.g., 10 seconds)
     * Processes clicks in batches of 5000
     */

    bufferKey = "click_buffer"
    batchSize = 5000

    WHILE TRUE:
        TRY:
            // Get batch of clicks from buffer
            clicks = cacheClient.listPopMultiple(bufferKey, batchSize)

            IF clicks.length == 0:
                wait(10 seconds)
                CONTINUE
            END IF

            // Parse serialized events
            events = []
            FOR EACH clickJSON IN clicks:
                event = parseJSON(clickJSON)
                events.append(event)
            END FOR

            // Bulk insert into database
            database.bulkInsert("affiliate_tracking", events)

            logInfo("Flushed " + events.length + " clicks to database")

        CATCH error:
            logError("Click buffer flush failed: " + error.message)

            // Move failed batch to dead-letter queue
            IF clicks.length > 0:
                deadLetterKey = "click_buffer:dead_letter"
                FOR EACH click IN clicks:
                    cacheClient.listPush(deadLetterKey, click)
                END FOR
            END IF
        END TRY

        wait(10 seconds)
    END WHILE
END FUNCTION
```

---

## Template Rendering

### Render Coupon Redirect Template
```
FUNCTION renderTemplate(response, templateName, data):
    /*
     * Renders EJS template with provided data
     * Returns HTML response to client
     */

    templatePath = "views/" + templateName + ".ejs"

    TRY:
        // Compile template (or use cached compiled version)
        template = templateEngine.load(templatePath)

        // Render with data
        html = template.render(data)

        // Send response
        response.setHeader("Content-Type", "text/html; charset=utf-8")
        response.setStatusCode(200)
        response.send(html)

    CATCH error:
        logError("Template rendering failed: " + error.message)
        THROW error
    END TRY
END FUNCTION
```

### Template Data Structure
```
STRUCTURE TemplateData:
    data: OBJECT {
        id: INTEGER
        coupon: STRING
        affiliate_id: INTEGER
        campaign_id: INTEGER
        campaign: OBJECT {
            id: INTEGER
            title: STRING
            url: STRING (destination URL)
            description: TEXT
            start_on: DATETIME
            end_on: DATETIME
            commission_type: STRING
            commission: INTEGER
        }
    }
    country: STRING
END STRUCTURE
```

---

## Client-Side Logic

### Template JavaScript (Embedded in HTML)
```
FUNCTION clientSideRedirectScript(affiliateLink, country):
    /*
     * JavaScript code embedded in coupon_redirect.ejs template
     * Executes in user's browser
     */

    // JavaScript pseudocode
    JAVASCRIPT:
        // Cookie utility function
        FUNCTION setCookie(name, value, days):
            expiryDate = new Date()
            expiryDate.setTime(expiryDate.getTime() + (days * 24 * 60 * 60 * 1000))
            expires = "expires=" + expiryDate.toUTCString()
            document.cookie = name + "=" + value + ";" + expires + ";path=/"
        END FUNCTION

        // Set tracking cookies
        couponCode = "{{ data.coupon }}"
        countryCode = "{{ country }}"

        setCookie("country", countryCode, 180)  // 6 months
        setCookie("coupon", couponCode, 2)       // 2 days

        // Build redirect URL
        TRY:
            campaignURL = "{{ data.campaign.url }}"
            url = new URL(campaignURL)

            // Replace hostname with current site
            IF window.location.hostname exists:
                url.hostname = window.location.hostname
            END IF

            // Add coupon as query parameter
            url.searchParams.set("coupon", couponCode)

            // Redirect after 1 second
            setTimeout(FUNCTION:
                window.location.href = url.href
            , 1000)

        CATCH error:
            console.error("Redirect failed:", error)

            // Fallback: redirect to site origin after 4 seconds
            setTimeout(FUNCTION:
                window.location.href = window.location.origin
            , 4000)
        END TRY
    END JAVASCRIPT
END FUNCTION
```

### Cookie Setting Algorithm
```
FUNCTION setCookie(name, value, expiryDays):
    /*
     * Sets HTTP cookie with expiration
     * Client-side implementation
     */

    currentTime = getCurrentTime()
    expiryTime = currentTime + (expiryDays * 24 * 60 * 60 * 1000)
    expiryDate = formatDate(expiryTime, "UTC")

    cookieString = name + "=" + encodeURIComponent(value) +
                   ";expires=" + expiryDate +
                   ";path=/" +
                   ";SameSite=Lax"

    document.cookie = cookieString
END FUNCTION
```

### URL Construction Algorithm
```
FUNCTION constructRedirectURL(campaignURL, currentHostname, couponCode):
    /*
     * Builds final redirect URL with coupon parameter
     * Replaces hostname with current site
     */

    // Parse campaign URL
    urlObj = parseURL(campaignURL)

    // Replace hostname if current hostname available
    IF currentHostname is not NULL AND currentHostname is not EMPTY:
        urlObj.hostname = currentHostname
    END IF

    // Add/update coupon query parameter
    urlObj.queryParameters["coupon"] = couponCode

    // Reconstruct full URL
    finalURL = urlObj.toString()

    RETURN finalURL
END FUNCTION
```

---

## Error Handling

### Global Error Handler
```
FUNCTION handleError(response, error):
    /*
     * Formats and sends error response
     * Handles different error types appropriately
     */

    // Extract status code
    statusCode = extractHTTPStatusCode(error, defaultCode: 500)

    // Extract error message
    message = extractErrorMessage(error)

    // Log error
    logError("Request failed: " + message + " (status: " + statusCode + ")")

    // Include stack trace in development
    errorResponse = {
        message: message,
        statusCode: statusCode
    }

    IF isDevEnvironment():
        errorResponse.stack = error.stackTrace
    END IF

    // Send JSON error response
    response.setHeader("Content-Type", "application/json")
    response.setStatusCode(statusCode)
    response.send(toJSON(errorResponse))
END FUNCTION
```

### Specific Error Handlers

#### Database Connection Error
```
FUNCTION handleDatabaseError(error):
    statusCode = 503  // Service Unavailable
    message = "Database temporarily unavailable"

    IF isDevEnvironment():
        message = message + ": " + error.message
    END IF

    RETURN createHTTPError(statusCode, message)
END FUNCTION
```

#### Cache Connection Error
```
FUNCTION handleCacheError(error):
    // Non-critical - log warning and continue
    logWarning("Cache operation failed: " + error.message)
    // Don't throw - graceful degradation
END FUNCTION
```

#### Invalid Coupon Error
```
FUNCTION handleInvalidCoupon(coupon):
    // Silent redirect - no error thrown
    logInfo("Invalid coupon requested: " + coupon)
    // Caller should redirect to /pricing
END FUNCTION
```

---

## Implementation Examples

### Python (Flask/FastAPI)
```python
from datetime import datetime, timedelta
from typing import Optional
import json
import asyncio

async def handle_promotion_coupon(request, coupon: str):
    """
    Handle promotion coupon request
    GET /api/promotion/coupon/:coupon
    """
    try:
        # Step 1: Try cache
        cache_key = f"affiliate:link:{coupon}"
        affiliate_link = None

        if redis_client.is_connected():
            try:
                cached_data = await asyncio.wait_for(
                    redis_client.get(cache_key),
                    timeout=1.0
                )
                if cached_data:
                    affiliate_link = json.loads(cached_data)
            except asyncio.TimeoutError:
                logger.warning(f"Cache read timeout for {coupon}")
            except Exception as e:
                logger.warning(f"Cache read error: {e}")

        # Step 2: Query database on cache miss
        if not affiliate_link:
            affiliate_link = await db.query(
                AffiliateLink
            ).filter(
                AffiliateLink.coupon == coupon
            ).join(
                Campaign
            ).filter(
                Campaign.start_on < datetime.now(),
                Campaign.end_on > datetime.now()
            ).first()

            # Step 3: Cache result
            if affiliate_link and redis_client.is_connected():
                try:
                    await asyncio.wait_for(
                        redis_client.setex(
                            cache_key,
                            1800,
                            json.dumps(affiliate_link.to_dict())
                        ),
                        timeout=1.0
                    )
                except Exception as e:
                    logger.warning(f"Cache write error: {e}")

        # Step 4: Handle invalid coupon
        if not affiliate_link:
            return redirect("/pricing")

        # Step 5: Extract country
        country = request.headers.get("cf-ipcountry", "UNKNOWN")

        # Step 6: Track click (async)
        asyncio.create_task(track_click_async({
            "country": country,
            "affiliate_id": affiliate_link.affiliate_id,
            "campaign_id": affiliate_link.campaign_id,
            "link_id": affiliate_link.id,
            "status": "CLICK"
        }))

        # Step 7: Render template
        return render_template(
            "coupon_redirect.html",
            data=affiliate_link,
            country=country
        )

    except Exception as e:
        logger.error(f"Coupon request failed: {e}")
        return jsonify({
            "message": str(e),
            "statusCode": 500
        }), 500


async def track_click_async(click_data):
    """Track click in background"""
    try:
        await db.execute(
            AffiliateTracking.__table__.insert().values(**click_data)
        )
        logger.info(f"Click tracked: {click_data['link_id']}")
    except Exception as e:
        logger.error(f"Click tracking failed: {e}")
```

### Go (Gin/Echo)
```go
package handlers

import (
    "context"
    "encoding/json"
    "net/http"
    "time"
)

type AffiliateLinkHandler struct {
    db          *sql.DB
    cache       *redis.Client
    logger      *log.Logger
}

func (h *AffiliateLinkHandler) HandlePromotionCoupon(c *gin.Context) {
    coupon := c.Param("coupon")

    // Step 1: Try cache
    cacheKey := fmt.Sprintf("affiliate:link:%s", coupon)
    var affiliateLink *AffiliateLink

    if h.cache != nil {
        ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
        defer cancel()

        cachedData, err := h.cache.Get(ctx, cacheKey).Result()
        if err == nil && cachedData != "" {
            json.Unmarshal([]byte(cachedData), &affiliateLink)
            h.logger.Printf("Cache hit for coupon: %s", coupon)
        } else if err != redis.Nil {
            h.logger.Printf("Cache read warning: %v", err)
        }
    }

    // Step 2: Query database on cache miss
    if affiliateLink == nil {
        h.logger.Printf("Cache miss for coupon: %s", coupon)

        query := `
            SELECT al.id, al.coupon, al.affiliate_id, al.campaign_id,
                   c.id, c.title, c.url, c.description
            FROM affiliate_links al
            INNER JOIN campaigns c ON al.campaign_id = c.id
            WHERE al.coupon = ?
              AND c.start_on < NOW()
              AND c.end_on > NOW()
            LIMIT 1
        `

        row := h.db.QueryRow(query, coupon)
        affiliateLink = &AffiliateLink{}
        err := row.Scan(
            &affiliateLink.ID,
            &affiliateLink.Coupon,
            &affiliateLink.AffiliateID,
            &affiliateLink.CampaignID,
            &affiliateLink.Campaign.ID,
            &affiliateLink.Campaign.Title,
            &affiliateLink.Campaign.URL,
            &affiliateLink.Campaign.Description,
        )

        if err == sql.ErrNoRows {
            affiliateLink = nil
        } else if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{
                "message": err.Error(),
                "statusCode": 500,
            })
            return
        }

        // Step 3: Cache result
        if affiliateLink != nil && h.cache != nil {
            ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
            defer cancel()

            jsonData, _ := json.Marshal(affiliateLink)
            h.cache.Set(ctx, cacheKey, jsonData, 1800*time.Second)
        }
    }

    // Step 4: Handle invalid coupon
    if affiliateLink == nil {
        c.Redirect(http.StatusFound, "/pricing")
        return
    }

    // Step 5: Extract country
    country := c.GetHeader("cf-ipcountry")
    if country == "" {
        country = "UNKNOWN"
    }

    // Step 6: Track click (goroutine)
    go func() {
        clickData := ClickTrackingEvent{
            Country:     country,
            AffiliateID: affiliateLink.AffiliateID,
            CampaignID:  affiliateLink.CampaignID,
            LinkID:      affiliateLink.ID,
            Status:      "CLICK",
        }

        _, err := h.db.Exec(
            `INSERT INTO affiliate_tracking
             (country, affiliate_id, campaign_id, link_id, status, payment, amount)
             VALUES (?, ?, ?, ?, ?, 'HOLD', 0.0)`,
            clickData.Country,
            clickData.AffiliateID,
            clickData.CampaignID,
            clickData.LinkID,
            clickData.Status,
        )

        if err != nil {
            h.logger.Printf("Click tracking failed: %v", err)
        } else {
            h.logger.Printf("Click tracked: %d", clickData.LinkID)
        }
    }()

    // Step 7: Render template
    c.HTML(http.StatusOK, "coupon_redirect.html", gin.H{
        "data":    affiliateLink,
        "country": country,
    })
}
```

### Java (Spring Boot)
```java
package com.example.controllers;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.scheduling.annotation.Async;
import java.time.Duration;
import java.util.concurrent.TimeoutException;

@RestController
@RequestMapping("/api/promotion")
public class AffiliateLinkController {

    @Autowired
    private AffiliateLinkRepository affiliateLinkRepo;

    @Autowired
    private AffiliateTrackingRepository trackingRepo;

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/coupon/{coupon}")
    public ModelAndView handlePromotionCoupon(
        @PathVariable String coupon,
        @RequestHeader(value = "cf-ipcountry", defaultValue = "UNKNOWN") String country
    ) {
        try {
            // Step 1: Try cache
            String cacheKey = "affiliate:link:" + coupon;
            AffiliateLink affiliateLink = null;

            try {
                String cachedData = redisTemplate.opsForValue()
                    .get(cacheKey);

                if (cachedData != null) {
                    affiliateLink = objectMapper.readValue(
                        cachedData,
                        AffiliateLink.class
                    );
                    logger.info("Cache hit for coupon: {}", coupon);
                }
            } catch (Exception e) {
                logger.warn("Cache read warning: {}", e.getMessage());
            }

            // Step 2: Query database on cache miss
            if (affiliateLink == null) {
                logger.info("Cache miss for coupon: {}", coupon);

                affiliateLink = affiliateLinkRepo
                    .findByCouponWithActiveCampaign(coupon)
                    .orElse(null);

                // Step 3: Cache result
                if (affiliateLink != null) {
                    try {
                        String jsonData = objectMapper.writeValueAsString(affiliateLink);
                        redisTemplate.opsForValue().set(
                            cacheKey,
                            jsonData,
                            Duration.ofSeconds(1800)
                        );
                    } catch (Exception e) {
                        logger.warn("Cache write warning: {}", e.getMessage());
                    }
                }
            }

            // Step 4: Handle invalid coupon
            if (affiliateLink == null) {
                logger.info("Invalid coupon: {}", coupon);
                return new ModelAndView("redirect:/pricing");
            }

            // Step 5: Track click (async)
            trackClickAsync(new ClickTrackingEvent(
                country,
                affiliateLink.getAffiliateId(),
                affiliateLink.getCampaignId(),
                affiliateLink.getId(),
                "CLICK"
            ));

            // Step 6: Render template
            ModelAndView mav = new ModelAndView("coupon_redirect");
            mav.addObject("data", affiliateLink);
            mav.addObject("country", country);
            return mav;

        } catch (Exception e) {
            logger.error("Coupon request failed", e);
            throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                e.getMessage()
            );
        }
    }

    @Async
    public void trackClickAsync(ClickTrackingEvent event) {
        try {
            trackingRepo.save(event);
            logger.info("Click tracked: {}", event.getLinkId());
        } catch (Exception e) {
            logger.error("Click tracking failed", e);
        }
    }
}

// Repository with custom query
@Repository
public interface AffiliateLinkRepository extends JpaRepository<AffiliateLink, Long> {

    @Query("SELECT al FROM AffiliateLink al " +
           "JOIN FETCH al.campaign c " +
           "WHERE al.coupon = :coupon " +
           "AND c.startOn < CURRENT_TIMESTAMP " +
           "AND c.endOn > CURRENT_TIMESTAMP")
    Optional<AffiliateLink> findByCouponWithActiveCampaign(@Param("coupon") String coupon);
}
```

### PHP (Laravel)
```php
<?php

namespace App\Http\Controllers;

use App\Models\AffiliateLink;
use App\Models\AffiliateTracking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class AffiliateLinkController extends Controller
{
    public function getPromotionCoupon(Request $request, string $coupon)
    {
        try {
            // Step 1: Try cache
            $cacheKey = "affiliate:link:{$coupon}";
            $affiliateLink = null;

            try {
                $cachedData = Redis::connection()
                    ->get($cacheKey);

                if ($cachedData) {
                    $affiliateLink = json_decode($cachedData, true);
                    Log::info("Cache hit for coupon: {$coupon}");
                }
            } catch (\Exception $e) {
                Log::warning("Cache read warning: " . $e->getMessage());
            }

            // Step 2: Query database on cache miss
            if (!$affiliateLink) {
                Log::info("Cache miss for coupon: {$coupon}");

                $affiliateLink = AffiliateLink::with('campaign')
                    ->where('coupon', $coupon)
                    ->whereHas('campaign', function ($query) {
                        $query->where('start_on', '<', Carbon::now())
                              ->where('end_on', '>', Carbon::now());
                    })
                    ->first();

                // Step 3: Cache result
                if ($affiliateLink) {
                    try {
                        Redis::connection()->setex(
                            $cacheKey,
                            1800,
                            json_encode($affiliateLink)
                        );
                    } catch (\Exception $e) {
                        Log::warning("Cache write warning: " . $e->getMessage());
                    }
                }
            }

            // Step 4: Handle invalid coupon
            if (!$affiliateLink) {
                Log::info("Invalid coupon: {$coupon}");
                return redirect('/pricing');
            }

            // Step 5: Extract country
            $country = $request->header('cf-ipcountry', 'UNKNOWN');

            // Step 6: Track click (dispatch job)
            dispatch(function () use ($affiliateLink, $country) {
                try {
                    AffiliateTracking::create([
                        'country' => $country,
                        'affiliate_id' => $affiliateLink->affiliate_id,
                        'campaign_id' => $affiliateLink->campaign_id,
                        'link_id' => $affiliateLink->id,
                        'status' => 'CLICK',
                        'payment' => 'HOLD',
                        'amount' => 0.0,
                    ]);
                    Log::info("Click tracked: {$affiliateLink->id}");
                } catch (\Exception $e) {
                    Log::error("Click tracking failed: " . $e->getMessage());
                }
            });

            // Step 7: Render template
            return view('coupon_redirect', [
                'data' => $affiliateLink,
                'country' => $country,
            ]);

        } catch (\Exception $e) {
            Log::error("Coupon request failed: " . $e->getMessage());
            return response()->json([
                'message' => $e->getMessage(),
                'statusCode' => 500,
            ], 500);
        }
    }
}
```

### Ruby (Rails)
```ruby
# app/controllers/affiliate_links_controller.rb

class AffiliateLinksController < ApplicationController
  skip_before_action :authenticate_user!, only: [:get_promotion_coupon]

  def get_promotion_coupon
    coupon = params[:coupon]

    begin
      # Step 1: Try cache
      cache_key = "affiliate:link:#{coupon}"
      affiliate_link = nil

      begin
        cached_data = Rails.cache.read(cache_key)
        if cached_data
          affiliate_link = JSON.parse(cached_data)
          Rails.logger.info "Cache hit for coupon: #{coupon}"
        end
      rescue => e
        Rails.logger.warn "Cache read warning: #{e.message}"
      end

      # Step 2: Query database on cache miss
      if affiliate_link.nil?
        Rails.logger.info "Cache miss for coupon: #{coupon}"

        affiliate_link = AffiliateLink
          .includes(:campaign)
          .where(coupon: coupon)
          .joins(:campaign)
          .where('campaigns.start_on < ?', Time.current)
          .where('campaigns.end_on > ?', Time.current)
          .first

        # Step 3: Cache result
        if affiliate_link
          begin
            Rails.cache.write(
              cache_key,
              affiliate_link.to_json,
              expires_in: 1800.seconds
            )
          rescue => e
            Rails.logger.warn "Cache write warning: #{e.message}"
          end
        end
      end

      # Step 4: Handle invalid coupon
      if affiliate_link.nil?
        Rails.logger.info "Invalid coupon: #{coupon}"
        redirect_to '/pricing' and return
      end

      # Step 5: Extract country
      country = request.headers['cf-ipcountry'] || 'UNKNOWN'

      # Step 6: Track click (background job)
      TrackClickJob.perform_later(
        country: country,
        affiliate_id: affiliate_link.affiliate_id,
        campaign_id: affiliate_link.campaign_id,
        link_id: affiliate_link.id,
        status: 'CLICK'
      )

      # Step 7: Render template
      render 'coupon_redirect', locals: {
        data: affiliate_link,
        country: country
      }

    rescue => e
      Rails.logger.error "Coupon request failed: #{e.message}"
      render json: {
        message: e.message,
        statusCode: 500
      }, status: 500
    end
  end
end

# app/jobs/track_click_job.rb
class TrackClickJob < ApplicationJob
  queue_as :default

  def perform(click_data)
    AffiliateTracking.create!(click_data.merge(
      payment: 'HOLD',
      amount: 0.0
    ))
    Rails.logger.info "Click tracked: #{click_data[:link_id]}"
  rescue => e
    Rails.logger.error "Click tracking failed: #{e.message}"
  end
end
```

---

## Configuration Reference

### Environment Variables
```
# Redis Cache
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=privatemedia
DB_USER=root
DB_PASSWORD=your_password

# Application
NODE_ENV=production
PORT=8080
TRUST_PROXY=true

# Cloudflare (for country detection)
# No configuration needed - uses cf-ipcountry header automatically
```

### Constants
```
CACHE_TTL_AFFILIATE_LINK = 1800        # 30 minutes in seconds
CACHE_TIMEOUT = 1000                   # 1 second in milliseconds
REDIRECT_DELAY = 1000                  # 1 second in milliseconds
COOKIE_EXPIRY_COUNTRY = 180            # 6 months in days
COOKIE_EXPIRY_COUPON = 2               # 2 days
BATCH_SIZE = 5000                      # Click buffer batch size
BUFFER_FLUSH_INTERVAL = 10             # Seconds between buffer flushes
```

---

## Performance Benchmarks

### Expected Response Times
```
Cache Hit:        50-100ms
Cache Miss:       200-500ms
Redis Unavailable: 300-600ms
```

### Database Operations
```
Query (with JOIN):  50-200ms
Insert (tracking):  10-50ms
Bulk Insert (5000): 200-500ms
```

### Cache Performance
```
Redis GET:          1-5ms
Redis SETEX:        1-5ms
Cache Hit Ratio:    80-90%
```

---

## Summary

This pseudocode provides a complete, language-agnostic implementation guide for the Promotion Coupon Endpoint. Key features include:

1. **Two-tier data retrieval** (cache → database)
2. **Timeout protection** on all cache operations
3. **Graceful degradation** if Redis unavailable
4. **Non-blocking tracking** for performance
5. **Campaign validation** at database level
6. **Client-side cookie setting** for attribution
7. **Error handling** at all layers

The implementation can be adapted to any web framework while maintaining the core logic and performance characteristics.
