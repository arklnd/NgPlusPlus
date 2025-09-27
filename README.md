# ng++

An Angular version upgrade helper built as a Model Context Protocol (MCP) server that provides intelligent dependency management and upgrade assistance.

## Overview

NgPlusPlus is designed to help developers upgrade Angular applications and manage their dependencies more effectively. It provides automated tools for dependency resolution, version updates, and compatibility checking through the Model Context Protocol.

## Features

- **Intelligent Dependency Resolution**: Automatically resolves transitive dependencies and ensures compatibility
- **Version Management**: Update packages using npm-check-updates with enhanced capabilities
- **Compatibility Checking**: Validates dependency compatibility before applying updates
- **MCP Integration**: Works seamlessly with MCP-compatible clients and AI assistants
- **Enhanced Echo Tools**: Multiple echo variants with formatting and AI enhancements

## Tools Available

### 1. Dependency Resolver (`dependency_resolver_update`)
Automatically updates package dependencies and resolves transitive dependencies:
- Updates specified packages to target versions
- Resolves and updates incompatible transitive dependencies
- Provides detailed feedback on all changes

### 2. NCU Tools (`ncu_update`)
Enhanced npm-check-updates functionality:
- Check for newer versions of dependencies
- Update package.json with latest compatible versions
- Optional doctor mode for breaking change detection

### 3. Echo Tools
Multiple echo variants for testing and enhancement:
- `echo`: Basic text echo
- `multi_echo`: Echo multiple texts with formatting options
- `echo_formatted`: Text formatting (uppercase, lowercase, etc.)
- `echo_ai_enhanced`: AI-powered enhancements (grammar, style, translation)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd NgPlusPlus
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### As an MCP Server

The primary use case is as an MCP server. After building, you can run it using:

```bash
npm start
```

Or for development:
```bash
npm run dev
```

### Configuration

The server can be configured to work with MCP clients. Add it to your MCP client configuration:

```json
{
  "mcpServers": {
    "ngplusplus": {
      "command": "node",
      "args": ["path/to/NgPlusPlus/dist/index.js"]
    }
  }
}
```

## Development

### Scripts

- `npm run dev` - Run in development mode with hot reload
- `npm run build` - Build the TypeScript project
- `npm run build:watch` - Build in watch mode
- `npm run test` - Run all tests
- `npm run clean` - Clean build artifacts

### Project Structure

```
src/
├── index.ts              # Main MCP server entry point
├── tools/                # MCP tools implementation
│   ├── dependency-resolver.tool.ts
│   ├── ncu.tool.ts
│   └── echo.tool.ts
├── utils/                # Utility functions
│   ├── logger.utils.ts
│   ├── package-json.utils.ts
│   └── version.utils.ts
└── services/             # External services
    └── openai.service.ts
```

### Testing

Run tests using:
```bash
npm test
```

Tests are located in the `test/` directory and use Mocha with Chai for assertions.

## Dependencies

### Runtime Dependencies
- `@modelcontextprotocol/sdk` - MCP SDK for server implementation
- `npm-check-updates` - Package update checking
- `openai` - AI service integration
- `semver` - Semantic versioning utilities
- `zod` - Schema validation

### Development Dependencies
- `typescript` - TypeScript compiler
- `mocha` & `chai` - Testing framework
- `tsx` - TypeScript execution

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

This project is licensed under the ISC License.

## Author

Arijit Kundu

## Documentation

For detailed documentation on specific tools, see the `docs/` directory:
- [Dependency Resolver](docs/dependency-resolver.md)
- [OpenAI Integration](docs/openai-integration.md)

## Logging

NgPlusPlus includes comprehensive logging capabilities:
- File-based logging with rotation
- Configurable log levels
- Structured logging with context
- Logs are stored in the `logs/` directory

## Support

For issues, questions, or contributions, please use the GitHub repository's issue tracker.