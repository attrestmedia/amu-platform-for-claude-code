declare module "mermaid" {
  type MermaidRenderResult = {
    svg: string;
    bindFunctions?: (element: Element) => void;
  };

  type MermaidApi = {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, text: string) => Promise<MermaidRenderResult> | MermaidRenderResult;
  };

  const mermaid: MermaidApi;
  export default mermaid;
}
