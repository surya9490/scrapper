import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';

// JWT secret - in production, this should be a strong, random secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticateToken = async (req, res, next) => {
  try {
    // If user is already authenticated (e.g., by devAutoAuth), continue
    if (req.user) {
      return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { 
        id: decoded.userId,
        isActive: true 
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        dashboardRateLimit: true,
        scrapingRateLimit: true,
        uploadRateLimit: true,
        isActive: true,
        lastLogin: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token or user not found'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Middleware to check if user has admin role
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  next();
};

/**
 * Optional authentication - adds user to request if token is valid, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { 
          id: decoded.userId,
          isActive: true 
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          dashboardRateLimit: true,
          scrapingRateLimit: true,
          uploadRateLimit: true,
          isActive: true
        }
      });

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't return errors, just continue without user
    next();
  }
};

/**
 * Generate JWT token for user
 */
export const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Hash password
 */
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Login function
 */
export const loginUser = async (email, password) => {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        error: 'Account is deactivated'
      };
    }

    // Check password
    const isValidPassword = await comparePassword(password, user.password);
    
    if (!isValidPassword) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate token
    const token = generateToken(user.id);

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          dashboardRateLimit: user.dashboardRateLimit,
          scrapingRateLimit: user.scrapingRateLimit,
          uploadRateLimit: user.uploadRateLimit
        }
      }
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: 'Login failed'
    };
  }
};

/**
 * Middleware for development - auto-login as admin if no auth header
 * This should only be used in development mode
 */
export const devAutoAuth = async (req, res, next) => {
  // Only use in development
  if (process.env.NODE_ENV === 'production') {
    return next();
  }

  // If already authenticated, continue
  if (req.user) {
    return next();
  }

  // If no auth header, auto-login as admin
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    try {
      const adminUser = await prisma.user.findUnique({
        where: { email: 'admin@scrapper.dev' },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          dashboardRateLimit: true,
          scrapingRateLimit: true,
          uploadRateLimit: true,
          isActive: true
        }
      });

      if (adminUser && adminUser.isActive) {
        req.user = adminUser;
        console.log('🔓 Development mode: Auto-authenticated as admin');
      }
    } catch (error) {
      console.error('Dev auto-auth error:', error);
    }
  }

  next();
};