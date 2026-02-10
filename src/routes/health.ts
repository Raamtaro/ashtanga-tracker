import {Router} from 'express'
import { healthAndGutCheck } from './controllers/health.js'

const router = Router();

router.get('/', healthAndGutCheck) // Mainly for beta testing - it is intended to show up in the client build on the login page so that I can verify how the environment variables are being set

export default router