// Simple example loader utility for DecViz
export interface Example {
    id: string
    name: string
    description: string
    domainLanguage: string
    visualLanguage: string
}

// Note: Examples are now loaded dynamically via /api/examples route
// This file only contains the TypeScript interface definition
// To add a new example:
// 1. Create a new JSON file in the examples/ folder
// 2. The example will automatically appear in the dropdown
// 3. No need to update any code files!