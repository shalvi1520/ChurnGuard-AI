"""
Stub route for the LangGraph orchestrator: POST /pipeline/run. Not wired
to any frontend -- defines the request/response shape and calls the real
orchestrator (Predict -> Explain -> Act).
"""
from typing import Any, Dict, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents import orchestrator

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


class PipelineRunRequest(BaseModel):
    customer_id: str
    raw_features: Dict[str, Any]
    pipeline_type: Literal["telco", "generic"] = "telco"


@router.post("/run")
def run_pipeline_endpoint(request: PipelineRunRequest):
    try:
        result = orchestrator.run_pipeline(
            customer_id=request.customer_id,
            raw_features=request.raw_features,
            pipeline_type=request.pipeline_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model artifacts not found for the requested pipeline_type.")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result
