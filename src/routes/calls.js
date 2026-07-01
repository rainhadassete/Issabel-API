const { Router } = require('express');
const callsController = require('../controllers/callsController');
const auth = require('../middleware/auth');

const router = Router();

/**
 * @openapi
 * /api/calls:
 *   get:
 *     tags: [Calls]
 *     summary: Listar registros de chamadas (CDR)
 *     description: Retorna chamadas paginadas com suporte a filtros por data, busca e disposição.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Registros por página (máximo 500)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Filtro data início (ISO 8601, ex: 2026-07-01)"
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Filtro data fim (ISO 8601)"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca por número (src, dst, clid)
 *       - in: query
 *         name: disposition
 *         schema:
 *           type: string
 *           enum: [ANSWERED, NO ANSWER, BUSY, FAILED, CONGESTION]
 *         description: Filtrar por status da chamada
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: calldate
 *         description: Coluna para ordenação
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Direção da ordenação
 *     responses:
 *       200:
 *         description: Lista de chamadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CallsResponse'
 *       400:
 *         description: Parâmetros inválidos
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
router.get('/', auth, callsController.list);

/**
 * @openapi
 * /api/calls/{id}:
 *   get:
 *     tags: [Calls]
 *     summary: Obter detalhes de uma chamada
 *     description: Retorna os dados completos de uma chamada pelo seu uniqueid.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UniqueID da chamada
 *     responses:
 *       200:
 *         description: Dados da chamada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/CDR'
 *       401:
 *         description: Token ausente ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Chamada não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', auth, callsController.getById);

module.exports = router;
