import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';

// Rate limiting configuration
export const createRateLimit = (windowMs: number = 15 * 60 * 1000, max: number = 100) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// AI-specific rate limiting (more restrictive)
export const aiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  20 // 20 requests per 15 minutes
);

// General API rate limiting
export const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100 // 100 requests per 15 minutes
);

// CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:5173',
      'https://outsidermap.netlify.app',
      'https://www.outsidermap.com'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.openai.com", process.env.VITE_SUPABASE_URL || ""],
    },
  },
  crossOriginEmbedderPolicy: false
});

// Input validation middleware
export const validateAiQuery = [
  body('query')
    .isString()
    .isLength({ min: 1, max: 500 })
    .trim()
    .escape()
    .withMessage('Query must be a string between 1 and 500 characters'),
  
  body('userId')
    .optional()
    .isUUID()
    .withMessage('User ID must be a valid UUID'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

export const validatePlaceSubmission = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .escape()
    .withMessage('Name must be between 1 and 100 characters'),
  
  body('description')
    .isString()
    .isLength({ min: 10, max: 1000 })
    .trim()
    .escape()
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('address')
    .isString()
    .isLength({ min: 5, max: 200 })
    .trim()
    .escape()
    .withMessage('Address must be between 5 and 200 characters'),
  
  body('vibe')
    .isIn(['chill', 'artsy', 'wild', 'romantic', 'foodie'])
    .withMessage('Invalid vibe type'),
  
  body('type')
    .isIn(['cafe', 'restaurant', 'bar', 'park', 'museum', 'other'])
    .withMessage('Invalid place type'),
  
  body('price_range')
    .isIn(['budget', 'moderate', 'expensive'])
    .withMessage('Invalid price range'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

export const validateNewsletterSubscription = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  
  body('name')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .trim()
    .escape()
    .withMessage('Name must be less than 100 characters'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

// Error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    ...(isDevelopment && { details: err.message, stack: err.stack })
  });
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// Analytics tracking middleware
export const trackAnalytics = (eventType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store analytics data in request for later processing
    req.analytics = {
      eventType,
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.get('X-Session-ID')
    };
    next();
  };
};

// Extend Request interface for analytics
declare global {
  namespace Express {
    interface Request {
      analytics?: {
        eventType: string;
        timestamp: Date;
        ip: string;
        userAgent?: string;
        sessionId?: string;
      };
    }
  }
} 