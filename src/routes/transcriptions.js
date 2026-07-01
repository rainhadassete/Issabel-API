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
 *       e processa com Whisper (offline, modelo base).
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
