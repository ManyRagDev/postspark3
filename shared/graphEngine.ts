export type GraphNodeId = string;

export type GraphNode<S, C = undefined> = (
  state: S,
  context: C,
) => S | Promise<S>;

export type GraphNext<S, C = undefined> = (
  nodeId: GraphNodeId,
  state: S,
  context: C,
) => GraphNodeId | null;

export interface StateGraphDefinition<S, C = undefined> {
  start: GraphNodeId;
  nodes: Record<GraphNodeId, GraphNode<S, C>>;
  next: GraphNext<S, C>;
  maxTransitions?: number;
}

export interface StateGraphResult<S> {
  state: S;
  visited: GraphNodeId[];
}

export async function runStateGraph<S, C = undefined>(input: {
  initialState: S;
  definition: StateGraphDefinition<S, C>;
  context: C;
}): Promise<StateGraphResult<S>> {
  const maxTransitions = input.definition.maxTransitions ?? 100;
  const visited: GraphNodeId[] = [];
  let state = input.initialState;
  let current: GraphNodeId | null = input.definition.start;

  while (current) {
    if (visited.length >= maxTransitions) {
      throw new Error(`State graph exceeded ${maxTransitions} transition(s).`);
    }

    const node = input.definition.nodes[current];
    if (!node) {
      throw new Error(`State graph node "${current}" is not registered.`);
    }

    visited.push(current);
    state = await node(state, input.context);
    current = input.definition.next(current, state, input.context);
  }

  return { state, visited };
}
