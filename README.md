# Issabel API

API REST para acessar dados de CDR (Call Detail Records) do Issabel PBX.

## Tecnologias

- Node.js + Express 5
- MySQL 2 (mysql2/promise)
- JWT (jsonwebtoken + bcryptjs)
- Swagger (swagger-jsdoc + swagger-ui-express)

## Requisitos

- Node.js 20+
- Acesso ao banco MySQL do Issabel (asteriskcdrdb)

## Instalação

```bash
# Clonar
git clone https://github.com/rainhadassete/Issabel-API.git
cd Issabel-API

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais do MySQL

# Criar usuário admin
npm run seed

# Iniciar
npm start
```

## Endpoints

| Método | Rota | Autenticação | Descrição |
|--------|------|:---:|-----------|
| GET | `/api/health` | ❌ | Status do servidor |
| POST | `/api/auth/login` | ❌ | Login (retorna JWT) |
| GET | `/api/calls` | ✅ | Lista chamadas |
| GET | `/api/calls/:id` | ✅ | Detalhe de chamada |
| GET | `/api/stats` | ✅ | Estatísticas |
| GET | `/api/docs` | ❌ | Swagger UI |

## Docker

```bash
docker compose up -d
```

## Documentação

Acesse `http://localhost:3000/api/docs` após iniciar o servidor.
