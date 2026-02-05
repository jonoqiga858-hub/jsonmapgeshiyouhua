import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Defines process.env.API_KEY global for the client code to work as requested.
    // Ensure API_KEY is set in your Vercel/Netlify environment variables.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    // Define empty process.env object to prevent "process is not defined" crashes if libraries try to access it
    'process.env': {}
  }
})