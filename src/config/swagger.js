const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Issabel PBX API',
      version: '1.0.0',
      description: `API REST para acessar dados de CDR (Call Detail Records) do Issabel PBX.

## Autenticação
A maioria dos endpoints exige token JWT no header \`Authorization: Bearer <token>\`.
Obtenha o token via \`POST /api/auth/login\`.

## Paginação
Endpoints que retornam listas suportam paginação com \`page\` e \`limit\`.
Retornam metadados de paginação no body da resposta.`,
      contact: {
        name: 'Suporte'
      }
    },
    servers: [
      {
        url: '',
        description: 'Servidor atual'
      },
      {
        url: 'http://localhost:3030',
        description: 'Desenvolvimento local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido via POST /api/auth/login'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Mensagem de erro'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            database: { type: 'string', enum: ['connected', 'disconnected'] }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'admin' },
            password: { type: 'string', example: 'Deltec@7371' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Bearer token' }
          }
        },
        CDR: {
          type: 'object',
          properties: {
            calldate: { type: 'string', format: 'date-time', description: 'Data/hora da chamada' },
            clid: { type: 'string', description: 'Caller ID completo' },
            src: { type: 'string', description: 'Número de origem' },
            dst: { type: 'string', description: 'Número de destino' },
            dcontext: { type: 'string', description: 'Contexto de destino' },
            channel: { type: 'string', description: 'Canal de origem' },
            dstchannel: { type: 'string', description: 'Canal de destino' },
            lastapp: { type: 'string', description: 'Última aplicação' },
            lastdata: { type: 'string', description: 'Dados da última aplicação' },
            duration: { type: 'integer', description: 'Duração total em segundos' },
            billsec: { type: 'integer', description: 'Duração faturada em segundos' },
            disposition: { type: 'string', enum: ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED', 'CONGESTION'] },
            amaflags: { type: 'integer' },
            accountcode: { type: 'string' },
            uniqueid: { type: 'string', description: 'Identificador único da chamada' },
            userfield: { type: 'string' },
            recordingfile: { type: 'string', description: 'Arquivo de gravação' },
            cnum: { type: 'string' },
            cnam: { type: 'string' },
            outbound_cnum: { type: 'string' },
            outbound_cnam: { type: 'string' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Página atual' },
            limit: { type: 'integer', description: 'Registros por página' },
            total: { type: 'integer', description: 'Total de registros' },
            total_pages: { type: 'integer', description: 'Total de páginas' },
            has_next: { type: 'boolean', description: 'Existe próxima página' },
            has_prev: { type: 'boolean', description: 'Existe página anterior' }
          }
        },
        CallsResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/CDR' }
            },
            pagination: { $ref: '#/components/schemas/Pagination' }
          }
        },
        StatsResponse: {
          type: 'object',
          properties: {
            period: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
                label: { type: 'string' }
              }
            },
            summary: {
              type: 'object',
              properties: {
                total_calls: { type: 'integer' },
                total_duration: { type: 'integer' },
                total_billsec: { type: 'integer' },
                avg_duration: { type: 'number' },
                max_duration: { type: 'integer' }
              }
            },
            by_disposition: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  disposition: { type: 'string' },
                  count: { type: 'integer' }
                }
              }
            },
            top_callers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  src: { type: 'string' },
                  call_count: { type: 'integer' },
                  total_billsec: { type: 'integer' }
                }
              }
            },
            top_destinations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dst: { type: 'string' },
                  call_count: { type: 'integer' },
                  total_billsec: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'Monitoramento do servidor' },
      { name: 'Auth', description: 'Autenticação' },
      { name: 'Calls', description: 'Consulta de registros de chamadas (CDR)' },
      { name: 'Stats', description: 'Estatísticas de chamadas' },
      { name: 'Recordings', description: 'Download de gravações de chamadas' },
      { name: 'Transcriptions', description: 'Transcrição de áudio via Whisper (offline)' }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};

module.exports = swaggerJsdoc(options);
