import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here if needed
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Check if user is authenticated
        if (!token) {
          return false
        }

        // Allow access to authenticated users
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    // Protect these routes
    '/dashboard/:path*',
    '/products/:path*',
    '/price-monitoring/:path*',
    '/scraping/:path*',
    '/upload/:path*',
    '/alerts/:path*',
    '/cron-jobs/:path*',
    '/queue/:path*',
    '/shopify/:path*',
  ]
}