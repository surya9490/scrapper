import express from 'express';
import { loginUser, generateToken, hashPassword, authenticateToken, requireAdmin } from '../middleware/auth.js';
import prisma from '../utils/prisma.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const result = await loginUser(email, password);
    
    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Login route error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', (req, res) => {
  // JWT tokens are stateless, so logout is handled client-side
  // In a production app, you might want to implement token blacklisting
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

/**
 * POST /api/auth/signup
 * Public user registration
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, username, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with default role 'user'
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username,
        password: hashedPassword,
        role: 'user',
        dashboardRateLimit: 600,
        scrapingRateLimit: 30,
        uploadRateLimit: 10,
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
        createdAt: true
      }
    });

    res.status(201).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/register
 * Register new user (admin only)
 */
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, username, password, role = 'user', dashboardRateLimit, scrapingRateLimit, uploadRateLimit } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, username, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username,
        password: hashedPassword,
        role,
        dashboardRateLimit: dashboardRateLimit || 600,
        scrapingRateLimit: scrapingRateLimit || 30,
        uploadRateLimit: uploadRateLimit || 10,
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
        createdAt: true
      }
    });

    res.status(201).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

/**
 * GET /api/auth/users
 * List all users (admin only)
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: parseInt(skip),
        take: parseInt(limit),
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          dashboardRateLimit: true,
          scrapingRateLimit: true,
          uploadRateLimit: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count()
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

/**
 * PUT /api/auth/users/:id
 * Update user (admin only)
 */
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, username, role, dashboardRateLimit, scrapingRateLimit, uploadRateLimit, isActive } = req.body;

    const updateData = {};
    if (email) updateData.email = email.toLowerCase();
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (dashboardRateLimit !== undefined) updateData.dashboardRateLimit = dashboardRateLimit;
    if (scrapingRateLimit !== undefined) updateData.scrapingRateLimit = scrapingRateLimit;
    if (uploadRateLimit !== undefined) updateData.uploadRateLimit = uploadRateLimit;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        dashboardRateLimit: true,
        scrapingRateLimit: true,
        uploadRateLimit: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/auth/users/:id
 * Delete user (admin only)
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for current user
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Verify current password
    const bcrypt = await import('bcryptjs');
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedNewPassword }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

export default router;