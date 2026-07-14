const { Router } = require('express');
const transcriptionController = require('../controllers/transcriptionController');
const auth = require('../middleware/auth');

const router = Router();

/**
 * @openapi
 * /api/calls/{id}/transcription:
 *   get:
 *     tags: [Transcriptions]
 *     summary: Obter transcrição da chamada
 *     description: >
 *       Retorna a transcrição do áudio da chamada. Se já foi processada antes,
 *       retorna do cache. Caso contrário, baixa o áudio via SFTP, converte para WAV
 *       e processa com Whisper (offline, modelo small).
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
 *         description: Transcrição concluída
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uniqueid:
 *                   type: string
 *                 text:
 *                   type: string
 *                   description: Texto transcrito
 *                 segments:
 *                   type: array
 *                   items:
 *                     type: object
 *                 language:
 *                   type: string
 *                   nullable: true
 *                 duration:
 *                   type: number
 *                 model:
 *                   type: string
 *                 from_cache:
 *                   type: boolean
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Chamada ou gravação não encontrada
 *       502:
 *         description: Erro de conexão SSH
 */
router.get('/calls/:id/transcription', auth, transcriptionController.getTranscription);

/**
 * @openapi
 * /api/calls/{id}/transcription:
 *   post:
 *     tags: [Transcriptions]
 *     summary: Processar transcrição automaticamente
 *     description: >
 *       Dispara o processamento da transcrição para uma chamada específica.
 *       Útil para ser chamado quando um arquivo de gravação é registrado.
 *       Idempotente — se já transcrita, retorna o cache.
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
 *       202:
 *         description: Transcrição processada com sucesso
 *       200:
 *         description: Transcrição já existente (cache)
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Chamada ou gravação não encontrada
 */
router.post('/calls/:id/transcription', auth, transcriptionController.processTranscription);

/**
 * @openapi
 * /api/transcriptions/process-pending:
 *   post:
 *     tags: [Transcriptions]
 *     summary: Processar transcrições pendentes em lote
 *     description: >
 *       Processa chamadas que possuem gravação mas ainda não foram transcritas.
 *       Aceita filtros por data e limite. Ideal para cron jobs.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Máximo de chamadas a processar (max 50)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar por data início (ISO 8601)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar por data fim (ISO 8601)
 *     responses:
 *       200:
 *         description: Resultado do processamento em lote
 *       401:
 *         description: Token ausente ou inválido
 */
router.post('/transcriptions/process-pending', auth, transcriptionController.processPending);

/**
 * @openapi
 * /api/transcriptions/worker/status:
 *   get:
 *     tags: [Transcriptions]
 *     summary: Status do worker de transcrição
 *     description: Retorna status, configuração e estatísticas do worker em background.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status do worker
 *       401:
 *         description: Token ausente ou inválido
 */
router.get('/transcriptions/worker/status', auth, transcriptionController.getWorkerStatus);

/**
 * @openapi
 * /api/transcriptions/worker/trigger:
 *   post:
 *     tags: [Transcriptions]
 *     summary: Forçar ciclo do worker
 *     description: Dispara imediatamente um ciclo de processamento de transcrições pendentes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ciclo executado
 *       401:
 *         description: Token ausente ou inválido
 */
router.post('/transcriptions/worker/trigger', auth, transcriptionController.triggerWorker);

/**
 * @openapi
 * /api/calls/{id}/transcription/text:
 *   get:
 *     tags: [Transcriptions]
 *     summary: Obter transcrição como texto puro
 *     description: Retorna apenas o texto da transcrição em formato text/plain.
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
 *         description: Texto transcrito
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Chamada não encontrada
 */
router.get('/calls/:id/transcription/text', auth, transcriptionController.getTranscriptionText);

module.exports = router;
