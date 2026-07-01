const { Router } = require('express');
const recordingController = require('../controllers/recordingController');
const auth = require('../middleware/auth');

const router = Router();

/**
 * @openapi
 * /api/calls/{id}/recording:
 *   get:
 *     tags: [Recordings]
 *     summary: Baixar gravação da chamada
 *     description: Faz o download do arquivo de áudio da chamada (GSM/WAV) via SFTP do Issabel.
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
 *         description: Arquivo de áudio
 *         content:
 *           audio/x-gsm:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Token ausente ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Chamada ou gravação não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Erro de conexão com servidor de gravações
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/calls/:id/recording', auth, recordingController.download);

/**
 * @openapi
 * /api/recordings/{filename}:
 *   get:
 *     tags: [Recordings]
 *     summary: Baixar gravação pelo nome do arquivo
 *     description: Busca a chamada pelo nome do arquivo de gravação e faz o download.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: "Nome do arquivo de gravação (ex: exten-7728-7742-20260701-143232-1782927152.266154.gsm)"
 *     responses:
 *       200:
 *         description: Arquivo de áudio
 *         content:
 *           audio/x-gsm:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Token ausente ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Gravação não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/recordings/:filename', auth, recordingController.downloadByFilename);

module.exports = router;
