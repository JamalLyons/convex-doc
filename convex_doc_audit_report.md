## 6. Gap Analysis — Missing Features

Beyond the above, here is what separates ConvexDoc from a "production-quality" or Enterprise tool:

1. **JSDoc Extraction (Critical):** Complex APIs require prose. Currently, descriptions have to be manually entered into [convexdoc.config.json](file:///Users/jamallyons/Developer/GitHub/convex-doc/convexdoc.config.json). ConvexDoc should parse the TypeScript source files (using the TS compiler API) to extract JSDoc comments preceding exported queries/mutations and auto-enrich the spec with descriptions.
2. **Integration Testing:** The `test/` folder contains decent unit tests for the parser and config. However, an E2E test leveraging Playwright to generate a site and click through the Function Runner UI is necessary for an OSS tool handling DOM interactions.

