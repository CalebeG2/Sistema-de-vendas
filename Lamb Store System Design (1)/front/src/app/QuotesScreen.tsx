import { useEffect, useMemo, useState } from "react";
import { Download, FilePlus2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import pengLogo from "../imports/Logo_peng.png";
import lambLogo from "../imports/Logo_lamb_preto.png";
import { apiFetch } from "../lib/api";

type QuoteItem = {
  quantidade: number;
  descricao: string;
  codigo: string;
  valor_unitario: number;
  valor_total: number;
};

type QuoteInstallment = {
  dias: string;
  vencimento: string;
  forma_pagamento: string;
  valor: number;
  observacao: string;
};

type Quote = {
  id?: number;
  empresa: "peng" | "lamb";
  cliente: string;
  cpf_cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  pedido_id: string;
  data: string;
  validade: string;
  itens: QuoteItem[];
  parcelas: QuoteInstallment[];
  observacoes: string;
  valor_total?: number;
  created_at?: string;
  updated_at?: string;
};

const companies = {
  peng: {
    name: "PENG CLOTHING",
    color: "#102e3d",
    logo: pengLogo,
  },
  lamb: {
    name: "LAMB CLOTHING",
    color: "#9b1117",
    logo: lambLogo,
  },
} as const;

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function datePtBr(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function blankQuote(): Quote {
  return {
    empresa: "peng",
    cliente: "",
    cpf_cnpj: "",
    telefone: "",
    email: "",
    endereco: "",
    cidade: "",
    uf: "",
    cep: "",
    pedido_id: "",
    data: todayIso(),
    validade: "",
    itens: [{ quantidade: 1, descricao: "", codigo: "", valor_unitario: 0, valor_total: 0 }],
    parcelas: [{ dias: "", vencimento: "", forma_pagamento: "", valor: 0, observacao: "" }],
    observacoes: "",
  };
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8fafc5]">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[#679bbc]/20 bg-[#0b3048]/50 px-3 py-2.5 text-sm text-[#e8f0f7] outline-none transition focus:border-[#679bbc]/60"
      />
    </label>
  );
}

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [draft, setDraft] = useState<Quote>(blankQuote);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const theme = companies[draft.empresa];
  const totalQuantity = useMemo(
    () => draft.itens.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0),
    [draft.itens]
  );
  const total = useMemo(
    () =>
      draft.itens.reduce(
        (sum, item) => sum + (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0),
        0
      ),
    [draft.itens]
  );

  useEffect(() => {
    let active = true;
    apiFetch("/api/quotes")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os orçamentos");
        if (active && Array.isArray(body)) setQuotes(body);
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : "Falha ao carregar os orçamentos");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof Quote>(key: K, value: Quote[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateItem(index: number, key: keyof QuoteItem, value: string | number) {
    setDraft((current) => ({
      ...current,
      itens: current.itens.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const changed = { ...item, [key]: value };
        changed.valor_total =
          (Number(changed.quantidade) || 0) * (Number(changed.valor_unitario) || 0);
        return changed;
      }),
    }));
  }

  function updateInstallment(index: number, key: keyof QuoteInstallment, value: string | number) {
    setDraft((current) => ({
      ...current,
      parcelas: current.parcelas.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  }

  async function saveQuote() {
    if (!draft.cliente.trim()) {
      toast.error("Preencha o nome do cliente antes de salvar");
      return;
    }
    if (!draft.itens.length || draft.itens.some((item) => !item.descricao.trim())) {
      toast.error("Preencha a descrição de todos os itens");
      return;
    }
    setIsSaving(true);
    try {
      const response = await apiFetch(draft.id ? `/api/quotes/${draft.id}` : "/api/quotes", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, valor_total: total }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar o orçamento");
      setDraft({ ...body, validade: body.validade || "" });
      setQuotes((current) => [
        body,
        ...current.filter((quote) => quote.id !== body.id),
      ]);
      toast.success(draft.id ? "Orçamento atualizado" : "Orçamento salvo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o orçamento");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteQuote(quote: Quote) {
    if (!quote.id || !window.confirm(`Excluir o orçamento de ${quote.cliente}?`)) return;
    try {
      const response = await apiFetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir o orçamento");
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
      if (draft.id === quote.id) setDraft(blankQuote());
      toast.success("Orçamento excluído");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir o orçamento");
    }
  }

  async function exportDocx() {
    try {
      const {
        AlignmentType,
        Document,
        ImageRun,
        Packer,
        Paragraph,
        ShadingType,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = await import("docx");
      const wordCell = (text: string, width: number, fill?: string) =>
        new TableCell({
          width: { size: width, type: WidthType.DXA },
          shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  bold: Boolean(fill),
                  color: fill ? "FFFFFF" : "333333",
                  size: 18,
                }),
              ],
            }),
          ],
        });
      const logoResponse = await fetch(theme.logo);
      if (!logoResponse.ok) throw new Error("Não foi possível carregar a marca da empresa");
      const logoData = new Uint8Array(await logoResponse.arrayBuffer());
      const widths = [700, 4800, 1400, 1700, 1900];
      const header = new TableRow({
        tableHeader: true,
        children: ["Qtd.", "Descrição do produto", "Código", "Valor unitário", "Valor total"].map(
          (text, index) => wordCell(text, widths[index], theme.color.slice(1))
        ),
      });
      const itemRows = draft.itens.map(
        (item) =>
          new TableRow({
            children: [
              wordCell(String(item.quantidade), widths[0]),
              wordCell(item.descricao || "—", widths[1]),
              wordCell(item.codigo || "—", widths[2]),
              wordCell(currency.format(Number(item.valor_unitario) || 0), widths[3]),
              wordCell(currency.format((Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0)), widths[4]),
            ],
          })
      );
      const itemTable = new Table({
        width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
        columnWidths: widths,
        rows: [header, ...itemRows],
      });
      const paymentTable = new Table({
        width: { size: 10500, type: WidthType.DXA },
        columnWidths: [1000, 3000, 2200, 1800, 2500],
        rows: [
          new TableRow({
            tableHeader: true,
            children: ["Dias", "Data de vencimento", "Forma de pagamento", "Valor", "Obs"].map(
              (text, index) => wordCell(text, [1000, 3000, 2200, 1800, 2500][index], theme.color.slice(1))
            ),
          }),
          ...draft.parcelas.map(
            (item) =>
              new TableRow({
                children: [
                  wordCell(item.dias || "—", 1000),
                  wordCell(datePtBr(item.vencimento) || "—", 3000),
                  wordCell(item.forma_pagamento || "—", 2200),
                  wordCell(currency.format(Number(item.valor) || 0), 1800),
                  wordCell(item.observacao || "—", 2500),
                ],
              })
          ),
        ],
      });
      const companyImage = new ImageRun({
        type: "png",
        data: logoData,
        transformation: draft.empresa === "peng" ? { width: 190, height: 82 } : { width: 140, height: 105 },
      });
      const doc = new Document({
        sections: [
          {
            properties: { page: { margin: { top: 500, right: 500, bottom: 500, left: 500 } } },
            children: [
              new Paragraph({ children: [companyImage] }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: theme.name, bold: true, size: 24 }),
                  new TextRun({ text: "\nCNPJ: 67.550.609/0001-05\n(11) 94556-2853\nwww.lambclothingbr.com.br", break: 1, size: 18 }),
                ],
              }),
              new Paragraph({ text: `ORÇAMENTO ${draft.pedido_id ? `· PEDIDO ${draft.pedido_id}` : ""}`, heading: "Heading1" }),
              new Paragraph({ children: [new TextRun({ text: "Cliente: ", bold: true }), new TextRun(draft.cliente || "—")] }),
              new Paragraph({ text: `CPF/CNPJ: ${draft.cpf_cnpj || "—"}   Telefone: ${draft.telefone || "—"}   E-mail: ${draft.email || "—"}` }),
              new Paragraph({ text: `Endereço: ${[draft.endereco, draft.cidade, draft.uf, draft.cep].filter(Boolean).join(" · ") || "—"}` }),
              new Paragraph({ text: `Data: ${datePtBr(draft.data)}   Validade: ${datePtBr(draft.validade) || "—"}` }),
              itemTable,
              new Paragraph({ alignment: AlignmentType.RIGHT, text: `Nº de itens: ${draft.itens.length}  ·  Soma das quantidades: ${totalQuantity}  ·  Total do pedido: ${currency.format(total)}` }),
              new Paragraph({ text: "Condições de pagamento", heading: "Heading2" }),
              paymentTable,
              new Paragraph({ text: "OBSERVAÇÕES", heading: "Heading3" }),
              new Paragraph({ text: draft.observacoes || "—" }),
            ],
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orcamento-${draft.empresa}-${draft.pedido_id || draft.id || "novo"}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar DOCX");
    }
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      itens: [...current.itens, { quantidade: 1, descricao: "", codigo: "", valor_unitario: 0, valor_total: 0 }],
    }));
  }

  function addInstallment() {
    setDraft((current) => ({
      ...current,
      parcelas: [...current.parcelas, { dias: "", vencimento: "", forma_pagamento: "", valor: 0, observacao: "" }],
    }));
  }

  const metaField = (
    label: string,
    value: string,
    key: "pedido_id" | "data" | "validade",
    type = "text"
  ) => (
    <Field
      label={label}
      value={value}
      type={type}
      onChange={(next) => update(key, next)}
    />
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          body * { visibility: hidden !important; }
          #quote-print-area, #quote-print-area * { visibility: visible !important; }
          #quote-print-area {
            position: fixed !important; inset: 0 auto auto 0 !important;
            width: 194mm !important; min-height: 280mm !important; margin: 0 !important;
            padding: 0 !important; border: 0 !important; border-radius: 0 !important;
            box-shadow: none !important; overflow: visible !important; color: #222 !important;
          }
          #quote-print-area table { page-break-inside: auto; }
          #quote-print-area tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[25px] font-bold leading-tight text-[#e8f0f7]">Orçamentos</h1>
          <p className="mt-1 text-sm text-[#8fafc5]">Preencha os dados e exporte no modelo da empresa selecionada.</p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(blankQuote())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#c11720] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#a0131a]"
        >
          <FilePlus2 size={16} /> Novo orçamento
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.95fr)]">
        <section className="space-y-5">
          <div className="rounded-xl border border-[#679bbc]/15 bg-[#0c1d2e] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[#e8f0f7]">Empresa e cliente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8fafc5]">Modelo da empresa</span>
                <select
                  value={draft.empresa}
                  onChange={(event) => update("empresa", event.target.value as Quote["empresa"])}
                  className="rounded-lg border border-[#679bbc]/20 bg-[#0b3048] px-3 py-2.5 text-sm text-[#e8f0f7] outline-none"
                >
                  <option value="peng">PENG CLOTHING</option>
                  <option value="lamb">LAMB CLOTHING</option>
                </select>
              </label>
              <Field label="Cliente" value={draft.cliente} onChange={(value) => update("cliente", value)} />
              {metaField("ID do pedido", draft.pedido_id, "pedido_id")}
              <Field label="CPF/CNPJ" value={draft.cpf_cnpj} onChange={(value) => update("cpf_cnpj", value)} />
              <Field label="Telefone" value={draft.telefone} onChange={(value) => update("telefone", value)} />
              <Field label="E-mail" type="email" value={draft.email} onChange={(value) => update("email", value)} />
              <Field label="Endereço" value={draft.endereco} onChange={(value) => update("endereco", value)} />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Cidade" value={draft.cidade} onChange={(value) => update("cidade", value)} />
                <Field label="UF" value={draft.uf} maxLength={2} onChange={(value) => update("uf", value.toUpperCase())} />
                <Field label="CEP" value={draft.cep} onChange={(value) => update("cep", value)} />
              </div>
              {metaField("Data", draft.data, "data", "date")}
              {metaField("Validade", draft.validade, "validade", "date")}
            </div>
          </div>

          <div className="rounded-xl border border-[#679bbc]/15 bg-[#0c1d2e] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#e8f0f7]">Produtos e serviços</h2>
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8fafc5] hover:text-white">
                <Plus size={14} /> Adicionar item
              </button>
            </div>
            <div className="space-y-3">
              {draft.itens.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-[#679bbc]/10 p-3 sm:grid-cols-[74px_minmax(0,1fr)_110px_125px_34px]">
                  <Field label="Qtd." type="number" value={String(item.quantidade)} onChange={(value) => updateItem(index, "quantidade", Math.max(1, Number(value) || 1))} />
                  <Field label="Descrição" value={item.descricao} onChange={(value) => updateItem(index, "descricao", value)} />
                  <Field label="Código" value={item.codigo} onChange={(value) => updateItem(index, "codigo", value)} />
                  <Field label="Valor unitário" type="number" value={String(item.valor_unitario)} onChange={(value) => updateItem(index, "valor_unitario", Math.max(0, Number(value) || 0))} />
                  <button
                    type="button"
                    aria-label="Remover item"
                    disabled={draft.itens.length === 1}
                    onClick={() => setDraft((current) => ({ ...current, itens: current.itens.filter((_, itemIndex) => itemIndex !== index) }))}
                    className="mt-5 flex h-9 items-center justify-center rounded-md text-[#8fafc5] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end text-sm font-semibold text-[#e8f0f7]">
              Total do orçamento: <span className="ml-2 text-[#679bbc]">{currency.format(total)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#679bbc]/15 bg-[#0c1d2e] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#e8f0f7]">Condições de pagamento</h2>
              <button type="button" onClick={addInstallment} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8fafc5] hover:text-white">
                <Plus size={14} /> Adicionar parcela
              </button>
            </div>
            <div className="space-y-3">
              {draft.parcelas.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-[#679bbc]/10 p-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="Dias" value={item.dias} onChange={(value) => updateInstallment(index, "dias", value)} />
                  <Field label="Vencimento" type="date" value={item.vencimento} onChange={(value) => updateInstallment(index, "vencimento", value)} />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8fafc5]">Forma de pagamento</span>
                    <select value={item.forma_pagamento} onChange={(event) => updateInstallment(index, "forma_pagamento", event.target.value)} className="rounded-lg border border-[#679bbc]/20 bg-[#0b3048] px-3 py-2.5 text-sm text-[#e8f0f7]">
                      <option value="">Selecione</option><option>PIX</option><option>Cartão</option><option>Boleto</option><option>À vista</option>
                    </select>
                  </label>
                  <Field label="Valor" type="number" value={String(item.valor)} onChange={(value) => updateInstallment(index, "valor", Math.max(0, Number(value) || 0))} />
                  <Field label="Obs." value={item.observacao} onChange={(value) => updateInstallment(index, "observacao", value)} />
                  <button
                    type="button"
                    aria-label="Remover parcela"
                    disabled={draft.parcelas.length === 1}
                    onClick={() => setDraft((current) => ({ ...current, parcelas: current.parcelas.filter((_, installmentIndex) => installmentIndex !== index) }))}
                    className="flex h-8 items-center justify-center rounded-md text-[#8fafc5] hover:text-red-400 disabled:opacity-30 sm:col-span-2 xl:col-span-5 xl:justify-end"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8fafc5]">Observações</span>
              <textarea value={draft.observacoes} maxLength={5000} rows={3} onChange={(event) => update("observacoes", event.target.value)} className="resize-y rounded-lg border border-[#679bbc]/20 bg-[#0b3048]/50 px-3 py-2.5 text-sm text-[#e8f0f7] outline-none focus:border-[#679bbc]/60" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveQuote} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-[#c11720] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              <Save size={15} /> {isSaving ? "Salvando..." : "Salvar orçamento"}
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-[#679bbc]/25 px-4 py-2.5 text-sm font-medium text-[#e8f0f7] hover:bg-[#679bbc]/10">
              <Printer size={15} /> Exportar PDF
            </button>
            <button type="button" onClick={exportDocx} className="inline-flex items-center gap-2 rounded-lg border border-[#679bbc]/25 px-4 py-2.5 text-sm font-medium text-[#e8f0f7] hover:bg-[#679bbc]/10">
              <Download size={15} /> Exportar DOCX
            </button>
          </div>

          <div className="rounded-xl border border-[#679bbc]/15 bg-[#0c1d2e] p-5">
            <h2 className="mb-3 text-sm font-semibold text-[#e8f0f7]">Orçamentos salvos</h2>
            {isLoading ? (
              <p className="text-sm text-[#8fafc5]">Carregando...</p>
            ) : quotes.length === 0 ? (
              <p className="text-sm text-[#8fafc5]">Nenhum orçamento salvo ainda.</p>
            ) : (
              <div className="divide-y divide-[#679bbc]/10">
                {quotes.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between gap-3 py-3">
                    <button type="button" onClick={() => setDraft({ ...quote, validade: quote.validade || "", itens: quote.itens || [], parcelas: quote.parcelas || [] })} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-[#e8f0f7]">{quote.cliente} · {companies[quote.empresa].name}</span>
                      <span className="mt-0.5 block text-xs text-[#8fafc5]">#{quote.pedido_id || quote.id} · {datePtBr(quote.data)} · {currency.format(Number(quote.valor_total) || 0)}</span>
                    </button>
                    <button type="button" title="Excluir orçamento" onClick={() => deleteQuote(quote)} className="rounded-md p-2 text-[#8fafc5] hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-auto rounded-xl border border-[#679bbc]/15 bg-[#0c1d2e] p-3 sm:p-5">
          <div
            id="quote-print-area"
            className="mx-auto min-h-[297mm] w-full max-w-[210mm] border border-gray-200 bg-white p-5 text-[11px] leading-snug text-[#222] shadow-xl sm:p-8"
          >
            <div className="mb-5 flex items-center justify-between gap-6">
              <img src={theme.logo} alt={theme.name} className="max-h-28 max-w-[52%] object-contain" />
              <div className="text-right text-[11px] leading-relaxed">
                <div className="text-[15px] font-medium">{theme.name}</div>
                <div>CNPJ: 67.550.609/0001-05</div>
                <div>(11) 94556-2853</div>
                <div>www.lambclothingbr.com.br</div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-[minmax(0,1fr)_170px] gap-3">
              <div>
                <div className="mb-1" style={{ color: theme.color }}>Cliente</div>
                <div className="min-h-9 rounded-lg border px-3 py-2" style={{ borderColor: theme.color }}>{draft.cliente || "\u00a0"}</div>
              </div>
              <div>
                <div className="mb-1" style={{ color: theme.color }}>ID do pedido</div>
                <div className="min-h-9 rounded-lg border px-3 py-2" style={{ borderColor: theme.color }}>{draft.pedido_id || "\u00a0"}</div>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div>CPF/CNPJ: {draft.cpf_cnpj || "—"}</div><div>Telefone: {draft.telefone || "—"}</div>
              <div>E-mail: {draft.email || "—"}</div><div>CEP: {draft.cep || "—"}</div>
              <div className="col-span-2">Endereço: {[draft.endereco, draft.cidade, draft.uf].filter(Boolean).join(" · ") || "—"}</div>
              <div>Data: {datePtBr(draft.data)}</div><div>Validade: {datePtBr(draft.validade) || "—"}</div>
            </div>

            <table className="mb-5 w-full table-fixed border-collapse text-[10px]">
              <colgroup><col style={{ width: "6%" }} /><col style={{ width: "55%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /></colgroup>
              <thead><tr style={{ backgroundColor: theme.color }} className="text-white">
                {["Qtd.", "Descrição do produto", "Código", "Valor unitário", "Valor total"].map((label) => <th key={label} className="border border-gray-300 px-1 py-3 text-center">{label}</th>)}
              </tr></thead>
              <tbody>
                {[
                  ...draft.itens,
                  ...Array.from({ length: Math.max(0, 12 - draft.itens.length) }, () => null),
                ].map((item, index) => (
                  <tr key={index} className="h-[25px]">
                    <td className="border border-gray-300 px-1 text-center">{item?.quantidade ?? ""}</td>
                    <td className="border border-gray-300 px-2">{item?.descricao ?? ""}</td>
                    <td className="border border-gray-300 px-1 text-center">{item?.codigo ?? ""}</td>
                    <td className="border border-gray-300 px-1 text-right">{item ? currency.format(Number(item.valor_unitario) || 0) : ""}</td>
                    <td className="border border-gray-300 px-1 text-right">{item ? currency.format((Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0)) : ""}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="border border-gray-300 px-2 py-2 text-right text-[#666]">
                    Nº de itens: {draft.itens.length}<br />Soma das Qtdes: {totalQuantity}<br />Total dos produtos<br /><strong>Total do pedido</strong>
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-right text-[#666]">
                    <br /><br />{currency.format(total)}<br /><strong>{currency.format(total)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="mb-5 w-full border-collapse text-[10px] text-[#666]">
              <thead><tr>{["Dias", "Data de vencimento", "Forma de pagamento", "Valor", "Obs"].map((label) => <th key={label} className="border border-gray-300 px-2 py-2 font-normal">{label}</th>)}</tr></thead>
              <tbody>{draft.parcelas.map((installment, index) => (
                <tr key={index} className="h-9">
                  <td className="border border-gray-300 px-2">{installment.dias}</td>
                  <td className="border border-gray-300 px-2 text-center">{datePtBr(installment.vencimento)}</td>
                  <td className="border border-gray-300 px-2 text-center">{installment.forma_pagamento}</td>
                  <td className="border border-gray-300 px-2 text-center">{currency.format(Number(installment.valor) || 0)}</td>
                  <td className="border border-gray-300 px-2 text-center">{installment.observacao}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="min-h-[55px] bg-[#f5f5f5] p-3 text-[9px] text-[#666]">
              <div className="mb-1 font-medium uppercase">Observações</div>
              <div className="whitespace-pre-wrap">{draft.observacoes}</div>
            </div>
            <div className="mt-3 flex justify-between text-[9px] text-[#777]">
              <span>{datePtBr(draft.data)}{draft.validade ? ` · válido até ${datePtBr(draft.validade)}` : ""}</span>
              <span>{draft.id ? `Orçamento #${draft.id}` : "Pré-visualização do orçamento"}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
