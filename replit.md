# IIG Israilov Import Group - Replit MD

## Overview

This is a full-stack web application for IIG Israilov Import Group, a professional procurement and sourcing company based in Los Angeles, CA. The application serves as a corporate website showcasing the company's global procurement services, with multi-language support and modern responsive design.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React Context for language management, TanStack Query for server state
- **Build Tool**: Vite for fast development and optimized builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Neon serverless driver
- **ORM**: Drizzle ORM for type-safe database operations
- **Session Management**: PostgreSQL session store with connect-pg-simple
- **Build Process**: esbuild for server-side bundling

### Development Environment
- **Hot Module Replacement**: Vite dev server with Express middleware
- **Type Safety**: Shared TypeScript configuration across client/server
- **Code Quality**: ESLint and TypeScript strict mode
- **Error Handling**: Runtime error overlay for development

## Key Components

### Client-Side Components
- **Navigation**: Sticky header with smooth scrolling and mobile responsive menu
- **Hero Section**: Full-screen landing with call-to-action buttons
- **Services Section**: Grid layout showcasing six core services with icons
- **About Section**: Company information with statistics and imagery
- **Gallery Section**: Photo showcase of business operations
- **Contact Section**: Contact form with validation and toast notifications
- **Footer**: Company information and navigation links

### Language System
- **Multi-language Support**: English, Russian, and Spanish
- **Context Provider**: React Context for global language state
- **Persistent Storage**: localStorage for language preference
- **Component Integration**: Custom useLanguage hook for easy access

### UI System
- **Design System**: shadcn/ui components with consistent theming
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
- **Accessibility**: ARIA labels and keyboard navigation support
- **Animations**: CSS transitions and custom animation classes

## Data Flow

### Client-Server Communication
- **API Routes**: Express routes prefixed with `/api`
- **HTTP Client**: Fetch-based API client with error handling
- **Query Management**: TanStack Query for caching and synchronization
- **Form Handling**: React Hook Form with Zod validation

### Database Operations
- **Schema Definition**: Shared schema between client and server
- **Type Safety**: Generated TypeScript types from Drizzle schema
- **Migrations**: Drizzle Kit for database schema management
- **Connection**: Neon serverless for PostgreSQL connectivity

### State Management
- **Global State**: React Context for language and theme
- **Server State**: TanStack Query for API data
- **Form State**: React Hook Form for form management
- **Local Storage**: Browser storage for user preferences

## External Dependencies

### Core Dependencies
- **React Ecosystem**: React, React DOM, React Hook Form, TanStack Query
- **UI Framework**: Radix UI primitives, Lucide React icons
- **Styling**: Tailwind CSS, class-variance-authority, clsx
- **Database**: Drizzle ORM, Neon serverless driver
- **Build Tools**: Vite, esbuild, TypeScript

### Development Dependencies
- **Type Definitions**: @types packages for Node.js and React
- **Development Tools**: tsx for TypeScript execution
- **Replit Integration**: Vite plugins for Replit environment

### Third-Party Services
- **Database**: Neon PostgreSQL serverless
- **Images**: Unsplash for placeholder images
- **Fonts**: Google Fonts (Inter), Font Awesome icons
- **CDN**: External CDN for font and icon resources

## Deployment Strategy

### Build Process
- **Client Build**: Vite builds React app to `dist/public`
- **Server Build**: esbuild bundles Express server to `dist/index.js`
- **Asset Optimization**: Vite handles CSS/JS minification and chunking
- **Type Checking**: TypeScript compilation verification

### Environment Configuration
- **Environment Variables**: DATABASE_URL for PostgreSQL connection
- **Development Mode**: NODE_ENV=development for dev server
- **Production Mode**: NODE_ENV=production for optimized builds

### Deployment Flow
1. Install dependencies with npm
2. Build client assets with Vite
3. Bundle server code with esbuild
4. Set up PostgreSQL database
5. Run database migrations
6. Start production server

## Changelog

```
Changelog:
- July 08, 2025. Initial setup
- July 08, 2025. Added PostgreSQL database support with Drizzle ORM
  - Created database connection in server/db.ts
  - Added DatabaseStorage class to replace MemStorage
  - Successfully pushed schema to database
  - Database now ready for user management and future features
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Communication language: Russian (пользователь предпочитает общение на русском языке)
```