import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  requireAuthenticatedOwner,
  applyRateLimit,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - owner only (backups contain sensitive data)
    const authResult = await requireAuthenticatedOwner(req);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('file');
    const tableFilter = searchParams.get('table'); // format: "schema.table"
    const type = searchParams.get('type') || 'data'; // 'data' or 'schema'

    if (!fileName) {
      return errorResponse('Missing file parameter', 400, rateLimitResult.headers);
    }

    // Validate fileName - only allow .sql files
    if (!fileName.endsWith('.sql') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return errorResponse('Invalid file name', 400, rateLimitResult.headers);
    }

    const backupDir = path.join(process.cwd(), '..', 'backups');
    const filePath = path.join(backupDir, fileName);

    // Path traversal protection - ensure resolved path is within backup directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBackupDir = path.resolve(backupDir);
    if (!resolvedPath.startsWith(resolvedBackupDir + path.sep) && resolvedPath !== resolvedBackupDir) {
      return errorResponse('Access denied', 403, rateLimitResult.headers);
    }

    if (!fs.existsSync(filePath)) {
      return errorResponse('File not found', 404, rateLimitResult.headers);
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return errorResponse('File too large', 413, rateLimitResult.headers);
    }

    if (type === 'schema_diagram') {
      // Parse schema.sql to build a mermaid diagram or relationship map
      const schemaPath = path.join(backupDir, 'schema.sql');

      // Path traversal protection for schema.sql
      const resolvedSchemaPath = path.resolve(schemaPath);
      if (!resolvedSchemaPath.startsWith(resolvedBackupDir + path.sep)) {
        return errorResponse('Access denied', 403, rateLimitResult.headers);
      }

      if (!fs.existsSync(schemaPath)) {
        return errorResponse('schema.sql not found for diagram', 404, rateLimitResult.headers);
      }

      const rl = readline.createInterface({
        input: fs.createReadStream(schemaPath),
        crlfDelay: Infinity
      });

      const tables: Record<string, { col: string, type: string }[]> = {};
      const relations: { from: string, to: string, label: string }[] = [];
      let currentTable: string | null = null;
      let lastAlterTable: string | null = null;

      for await (const line of rl) {
        const trimmedLine = line.trim();

        // Match: CREATE TABLE IF NOT EXISTS "public"."users" (
        const tableMatch = trimmedLine.match(/^CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\."([^"]+)" \(/i);
        if (tableMatch) {
          currentTable = `${tableMatch[1]}.${tableMatch[2]}`;
          tables[currentTable] = [];
          continue;
        }

        if (currentTable && (trimmedLine === ');' || trimmedLine.startsWith(');'))) {
          currentTable = null;
          continue;
        }

        if (currentTable) {
          const colMatch = trimmedLine.match(/^"([^"]+)"\s+([^,\s\)]+)/);
          if (colMatch) {
            tables[currentTable].push({
              col: colMatch[1],
              type: colMatch[2].replace(/"/g, '')
            });
          }
        }

        const alterTableMatch = trimmedLine.match(/^ALTER TABLE (?:ONLY )?"([^"]+)"\."([^"]+)"/i);
        if (alterTableMatch) {
          lastAlterTable = `${alterTableMatch[1]}.${alterTableMatch[2]}`;
        }

        const relMatch = trimmedLine.match(/(?:ADD CONSTRAINT .* )?FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)"\."([^"]+)"\("([^"]+)"\)/i);
        if (relMatch && (lastAlterTable || trimmedLine.match(/ALTER TABLE/i))) {
          let fromTable = lastAlterTable;

          if (trimmedLine.match(/ALTER TABLE (?:ONLY )?"([^"]+)"\."([^"]+)"/i)) {
            const m = trimmedLine.match(/ALTER TABLE (?:ONLY )?"([^"]+)"\."([^"]+)"/i);
            if (m) fromTable = `${m[1]}.${m[2]}`;
          }

          if (fromTable) {
            relations.push({
              from: fromTable,
              to: `${relMatch[2]}.${relMatch[3]}`,
              label: relMatch[1]
            });
          }
        }

        if (trimmedLine.endsWith(';')) {
          lastAlterTable = null;
        }
      }

      return successResponse({ tables, relations }, rateLimitResult.headers);
    }

    // Default: Parse data from the selected file
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const tables: { schema: string, table: string }[] = [];
    let currentTable: { schema: string, table: string, columns: string[] } | null = null;
    let inDataSection = false;
    const tableDataRows: string[][] = [];

    for await (const line of rl) {
      if (line.startsWith('COPY ')) {
        const parts = line.match(/COPY\s+"([^"]+)"\."([^"]+)"\s+\(([^)]+)\)\s+FROM stdin;/);
        if (parts) {
          const schema = parts[1];
          const table = parts[2];
          const columns = parts[3].split(',').map(c => c.trim().replace(/"/g, ''));

          const fullTableName = `${schema}.${table}`;
          tables.push({ schema, table });

          if (tableFilter === fullTableName) {
            currentTable = { schema, table, columns };
            inDataSection = true;
          }
        }
        continue;
      }

      if (inDataSection) {
        if (line === '\\.') {
          inDataSection = false;
          if (tableFilter) break;
          continue;
        }

        if (currentTable) {
          tableDataRows.push(line.split('\t'));
        }
      }
    }

    return successResponse({
      tables,
      tableData: currentTable ? {
        ...currentTable,
        rows: tableDataRows
      } : null
    }, rateLimitResult.headers);

  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
