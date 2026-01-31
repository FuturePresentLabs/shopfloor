# Floor Plan Editor

Interactive floor plan editor with 2D/3D visualization using Three.js.

## Features

- **2D Drawing Tools**: Wall drawing, rectangle rooms, freeform shapes
- **3D Visualization**: Real-time 3D preview with orbit controls
- **Furniture Library**: Pre-built furniture and fixture models
- **Electrical Wiring**: Wire routing with connection points
- **Measurements**: Dimension labels with unit conversion
- **Save/Load**: JSON project file format

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Docker (optional, for containerized deployment)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd shopfloor

# Install dependencies
npm install
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Open browser at http://localhost:3000
```

### Build

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

### Testing

```bash
# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Docker Deployment

### Build and Run with Docker

```bash
# Build Docker image
npm run docker:build
# or
docker build -t floor-plan-editor .

# Run container
npm run docker:run
# or
docker run -p 8080:80 floor-plan-editor

# Access at http://localhost:8080
```

### Docker Compose

```bash
# Production (nginx)
docker-compose up -d

# Development with hot reload
docker-compose --profile dev up

# Node.js production server
docker-compose --profile node up
```

### Multi-Stage Build Targets

The Dockerfile supports multiple build targets:

| Target | Description | Port |
|--------|-------------|------|
| `production` | Nginx static server (default) | 80 |
| `node-production` | Node.js Express server | 8080 |

```bash
# Build specific target
docker build --target production -t floor-plan-editor:nginx .
docker build --target node-production -t floor-plan-editor:node .
```

## Project Structure

```
shopfloor/
├── floor-plan-editor.html    # Main application (single HTML file)
├── package.json              # Project configuration
├── vite.config.js            # Vite build configuration
├── vitest.config.js          # Test configuration
├── server.js                 # Production Node.js server
├── Dockerfile                # Multi-stage Docker build
├── Dockerfile.dev            # Development Docker build
├── docker-compose.yml        # Docker Compose configuration
├── nginx.conf                # Nginx configuration
├── tests/                    # Test files
│   ├── setup.js              # Test setup and mocks
│   ├── utils.test.js         # Unit tests
│   └── integration.test.js   # Integration tests
└── dist/                     # Build output (generated)
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build |
| `npm run start` | Start production server |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Lint source files |
| `npm run docker:build` | Build Docker image |
| `npm run docker:run` | Run Docker container |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `W` | Wall drawing tool |
| `R` | Rectangle room tool |
| `V` | Select tool |
| `E` | Wire drawing tool |
| `D` | Dimension tool |
| `Q` | Toggle 2D/3D view |
| `Delete` | Delete selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save project |
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |

## Mouse Controls

### 2D View
- **Left Click**: Use current tool
- **Right Click**: Pan view
- **Scroll**: Zoom in/out
- **Shift+Drag**: Free movement (no grid snap)

### 3D View
- **Left Click**: Select objects
- **Right Click**: Rotate camera
- **Middle Mouse**: Pan camera
- **Scroll**: Zoom in/out

## API Endpoints (Node.js Server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main application |
| `/health` | GET | Health check |
| `/api/info` | GET | Application info |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port (Node.js) |
| `HOST` | 0.0.0.0 | Server host |
| `NODE_ENV` | development | Environment mode |

### Build Configuration

Edit `vite.config.js` to customize:
- Output directory
- Minification options
- Legacy browser support
- Asset handling

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT
