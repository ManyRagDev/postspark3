import type { HighTicketPipelineInput, HighTicketPipelineResult } from "@shared/highTicket";
import { runHighTicketGraph } from "./graph";

export async function runHighTicketPipeline(
  input: HighTicketPipelineInput,
): Promise<HighTicketPipelineResult> {
  return runHighTicketGraph(input);
}
