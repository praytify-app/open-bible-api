// src/routes/esv-audio.ts

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../lib/openapi-schemas.js";

const esvAudioRouter = new OpenAPIHono();

const ESV_API_BASE = "https://api.esv.org/v3/passage";

const audioRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["ESV Audio"],
  summary: "Get ESV audio URL for a passage",
  description: "Returns the MP3 audio URL for an ESV Bible passage. Requires ESV_API_TOKEN to be configured.",
  request: {
    query: z.object({
      q: z.string().min(1).openapi({
        description: "Passage reference (e.g. 'Genesis 1', 'John 3:16')",
        example: "Genesis 1",
      }),
    }),
  },
  responses: {
    200: {
      description: "Audio URL for the passage",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              reference: z.string(),
              audioUrl: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Missing passage reference",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description: "ESV API not configured",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

esvAudioRouter.openapi(audioRoute, async (c): Promise<any> => {
  const apiToken = process.env.ESV_API_TOKEN;
  if (!apiToken) {
    return c.json(
      { error: { code: "ESV_NOT_CONFIGURED", message: "ESV API is not configured" } },
      503,
    );
  }

  const reference = c.req.query("q");
  if (!reference) {
    return c.json(
      { error: { code: "MISSING_REFERENCE", message: "Query parameter 'q' is required" } },
      400,
    );
  }

  const params = new URLSearchParams({ q: reference });

  // Fetch with manual redirect to capture the MP3 URL
  const response = await fetch(`${ESV_API_BASE}/audio/?${params}`, {
    headers: { Authorization: `Token ${apiToken}` },
    redirect: "manual",
  });

  const location = response.headers.get("Location");
  if (location) {
    return c.json({
      data: { reference, audioUrl: location },
    });
  }

  // If the response is OK and no redirect, build the direct URL
  if (response.ok) {
    return c.json({
      data: {
        reference,
        audioUrl: `${ESV_API_BASE}/audio/?${params}`,
      },
    });
  }

  return c.json(
    { error: { code: "ESV_AUDIO_ERROR", message: `ESV API returned ${response.status}` } },
    502,
  );
});

export { esvAudioRouter };
