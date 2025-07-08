#!/bin/bash

# Установочный скрипт для IIG Website
echo "🚀 Создание проекта IIG Website..."

# Создание структуры папок
mkdir -p iig-website/client/src/{components,hooks,lib,pages}
mkdir -p iig-website/server
mkdir -p iig-website/shared

cd iig-website

# Создание package.json
cat > package.json << 'EOF'
{
  "name": "iig-website",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@neondatabase/serverless": "^0.10.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@tanstack/react-query": "^5.60.5",
    "drizzle-orm": "^0.39.1",
    "drizzle-zod": "^0.7.0",
    "express": "^4.21.2",
    "lucide-react": "^0.453.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "tailwindcss": "^3.4.17",
    "wouter": "^3.3.5",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/express": "4.17.21",
    "@types/node": "20.16.11",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "esbuild": "^0.25.0",
    "tsx": "^4.19.1",
    "typescript": "5.6.3",
    "vite": "^5.4.19"
  }
}
EOF

echo "✅ Создан package.json"

# Установка пакетов
echo "📦 Установка пакетов..."
npm install

echo "🎉 Проект готов!"
echo "Запуск: npm run dev"
echo "Порт: http://localhost:5000"
EOF