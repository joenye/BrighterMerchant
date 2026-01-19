# Contributing to Brighter Merchant

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js 20+
- npm
- macOS, Windows, or Linux

### Getting Started

```bash
git clone https://github.com/joenye/BrighterMerchant.git
cd BrighterMerchant
npm install
npm run start
```

## Project Structure

```
src/
├── algorithm/       # Pathfinding and bounty optimization
├── app/
│   ├── config/      # Configuration and constants
│   ├── core/        # OCR, screenshots, session tracking
│   ├── ui/          # Overlay and settings windows
│   ├── utils/       # Utilities and helpers
│   └── workers/     # Pathfinding utility processes
└── lib/             # Native overlay window code (C/C++)
```

## Making Changes

- Use TypeScript for all new code
- Follow existing patterns and naming conventions
- Test thoroughly before submitting

### Testing

```bash
npm run start              # Run in development mode
npm run start:rebuild      # Rebuild native modules and run
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and test
4. Commit with clear messages (`feat:`, `fix:`, `docs:`, etc.)
5. Push to your fork
6. Open a Pull Request

### Pull Request Guidelines

- Describe what your PR does and why
- Reference related issues
- Keep PRs focused on a single change

## Reporting Issues

See [GitHub Issues](https://github.com/joenye/BrighterMerchant/issues). Include:
- OS and Brighter Merchant version
- Steps to reproduce
- Expected vs actual behavior
- Error messages from Settings → Log tab

## Questions?

For general questions about development or the codebase, ask in [Discord](https://discord.gg/mQdKPjDT).
