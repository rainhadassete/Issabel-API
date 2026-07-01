const { Router } = require('express');
const statsController = require('../controllers/statsController');
const auth = require('../middleware/auth');

const router = Router();

/**
 * @openapi
 * /api/stats:
 *   get:
 *     tags: [Stats]
 *     summary: Estatísticas de chamadas
 *     description: Retorna estatísticas agregadas das chamadas em um período.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, yesterday, this_week, this_month, last_30_days, custom]
 *           default: today
 *         description: Período para as estatísticas
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data início (obrigatório se period=custom)"
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data fim (obrigatório se period=custom)"
 *     responses:
 *       200:
 *         description: Estatísticas do período
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatsResponse'
 *       400:
 *         description: Período inválido ou datas ausentes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Token ausente ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', auth, statsController.getStats);

module.exports = router;
