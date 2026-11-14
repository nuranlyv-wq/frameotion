export const CAUSAL_CONTINUITY_DIRECTION=`Semantic and visual continuity is a mandatory default. Each scene must develop the previous scene’s result, subject or ongoing task, and the transition must make that relationship visible. A smooth wipe, matched silhouette, camera move, common palette or reused decorative icon does not connect unrelated ideas. Preserve the actual request, project, document, selected object or message as its function changes. Explain why the next action follows the previous outcome before choosing the transition. When demonstrating several studios or formats, continue one project or idea instead of inserting unrelated examples. If removing or shuffling a scene leaves the story unchanged, redesign its causal role. Correct a disconnected sequence by changing the story and staging, not by adding more effects. Exact explicit user instructions take precedence.`;

// Supply adjacent causes and consequences together to the reviewer. Geometry
// proves a spatial match; it cannot prove that two scenes mean the same thing.
export function causalContinuityContext(treatment,score){
  const beats=treatment?.beats??[];
  return {policy:'semantic-and-visual',semanticAssessment:'required; not established by geometric checks',
    pairs:beats.slice(1).map((next,i)=>{
      const previous=beats[i],scene=score?.scenes?.find(s=>s.sourceScene===next.id||s.id===next.id)??score?.scenes?.[i+1],element=score?.elements?.find(e=>e.stage&&e.start===scene?.start);
      return {from:previous.id,to:next.id,previousAction:previous.action,previousOutcome:previous.landing,statedBridge:previous.handoff,nextAction:next.action,nextOutcome:next.landing,
        mechanism:next.visual?.link??scene?.link?.kind??null,carriedActors:element?.stage.handoffs??[],hasStatedBridge:Boolean(previous.handoff?.trim())};
    })};
}
