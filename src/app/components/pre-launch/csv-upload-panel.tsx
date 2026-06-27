import { useRef, useState, type DragEvent } from "react";
import { AlertCircle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { parseSoundingCsv, REQUIRED_CSV_COLUMNS, type CsvParseResult } from "./csv-utils";

interface Props {
  onParsed: (result: CsvParseResult, fileName: string) => void;
}

export function CsvUploadPanel({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const parseFile = async (file: File) => {
    setFileName(file.name);
    setMessage(null);
    setError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setPreview(null);
      setError("Upload a CSV file.");
      return;
    }

    try {
      const text = await file.text();
      const result = parseSoundingCsv(text);
      setPreview(result);
      setMessage(`Validated ${result.rows.length} rows. Surface observations were filled from row 1.`);
      onParsed(result, file.name);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Unable to parse CSV.");
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void parseFile(file);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition-colors ${
          isDragging
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-cyan-500/30 bg-slate-950/40"
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
          <FileUp className="h-6 w-6" />
        </div>
        <div className="text-sm font-medium">Drop sounding CSV here</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Required columns are validated before upload.
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4 gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Browse file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void parseFile(file);
          }}
        />
      </div>

      <div className="rounded-lg border border-border/60 bg-card/30 p-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Required Columns</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {REQUIRED_CSV_COLUMNS.map((column) => (
            <span
              key={column}
              className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100"
            >
              {column}
            </span>
          ))}
        </div>
      </div>

      {fileName && (
        <div className="text-xs text-muted-foreground">
          Selected file: <span className="text-foreground">{fileName}</span>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-sm text-green-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {message}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Preview First 10 Rows
          </div>
          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  {REQUIRED_CSV_COLUMNS.map((column) => (
                    <TableHead key={column} className="text-[11px]">
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.previewRows.map((row, index) => (
                  <TableRow key={`${row.pressure_hPa}-${index}`}>
                    {REQUIRED_CSV_COLUMNS.map((column) => (
                      <TableCell key={column} className="text-xs">
                        {row[column]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
