import json
from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.models import ClusterModelBundle, AudioBundle
from app.services.db_service import get_db_connection

router = APIRouter()

@router.get("/cluster/{cluster_id:path}", response_model=ClusterModelBundle, summary="Fetch Active Cluster Model JS & Baseline for m2cgen On-Device Evaluation")
async def get_cluster_model(cluster_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    # Check by ID or Cluster Name (e.g. 'Dairy' vs UUID)
    cur.execute("""
        SELECT cm.cluster_id, cm.version, cm.forecast_model_js, cm.risk_model_js,
               cm.baseline_json, cm.templates_json, cm.created_at
        FROM cluster_models cm
        LEFT JOIN clusters c ON c.id = cm.cluster_id
        WHERE (cm.cluster_id = ? OR c.name = ?) AND cm.is_active = 1
        ORDER BY cm.created_at DESC LIMIT 1
    """, (cluster_id, cluster_id))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active cluster model not found for cluster_id: {cluster_id}"
        )
    
    return ClusterModelBundle(
        cluster_id=row["cluster_id"],
        version=row["version"],
        forecast_model_js=row["forecast_model_js"],
        risk_model_js=row["risk_model_js"],
        baseline_json=json.loads(row["baseline_json"]) if isinstance(row["baseline_json"], str) else row["baseline_json"],
        templates_json=json.loads(row["templates_json"]) if isinstance(row["templates_json"], str) else row["templates_json"],
        cached_at=row["created_at"]
    )

@router.get("/active/{cluster_id:path}/audio/{lang}", response_model=AudioBundle, summary="Fetch Localized Audio Bundle for Active Cluster & Language")
async def get_cluster_audio(cluster_id: str, lang: str):
    if lang not in ['hi', 'te', 'ta', 'en']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language code: {lang}. Must be 'hi', 'te', 'ta', or 'en'."
        )
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT c.id, c.name FROM clusters c WHERE c.id = ? OR c.name = ?
    """, (cluster_id, cluster_id))
    cluster_row = cur.fetchone()
    conn.close()
    
    resolved_cluster_id = cluster_row["id"] if cluster_row else cluster_id
    cluster_name = cluster_row["name"] if cluster_row else "Dairy"
    
    # Localized templates per TRD_final.md §6 and UX_design_brief_final.md §5
    localized_templates = {
        'hi': {
            'Dairy': "दूध उत्पादन और मवेशियों की संख्या के आधार पर आपकी साख सीमा तय की गई है। स्व-घोषित राजस्व भौतिक क्षमता से अधिक पाए जाने पर समीक्षा आवश्यक है।",
            'Kirana / Rural Retail': "दुकान के क्षेत्रफल, स्टॉक और पुनः आपूर्ति आवृत्ति के आधार पर आपकी साख सीमा आंकी गई है।",
            'Handicraft': "कारीगरों की संख्या, हथकरघा और कच्चे माल के मूल्य के आधार पर आपकी साख क्षमता तय हुई है।"
        },
        'te': {
            'Dairy': "పాల దిగుబడి మరియు పశువుల సంఖ్య ఆధారంగా మీ రుణ పరిమితి నిర్ణయించబడింది. నివేదించబడిన ఆదాయం భౌతిక సామర్థ్యం కంటే ఎక్కువగా ఉంటే సమీక్ష అవసరం.",
            'Kirana / Rural Retail': "దుకాణం విస్తీర్ణం, సరుకు నిల్వ మరియు స్టాక్ పునరుద్ధరణ ఆధారంగా మీ క్రెడిట్ అంచనా వేయబడింది.",
            'Handicraft': "కళాకారుల సంఖ్య, మగ్గాలు మరియు ముడి సరుకు విలువ ఆధారంగా మీ రుణ సామర్థ్యం నిర్ణయించబడింది."
        },
        'ta': {
            'Dairy': "பால் உற்பத்தி மற்றும் கால்நடைகளின் எண்ணிக்கை அடிப்படையில் உங்கள் கடன் வரம்பு தீர்மானிக்கப்பட்டுள்ளது.",
            'Kirana / Rural Retail': "கடை பரப்பளவு, சரக்கு இருப்பு மற்றும் மறுவிற்பனை அடிப்படையில் உங்கள் கடன் வரம்பு கணிக்கப்பட்டுள்ளது.",
            'Handicraft': "கைவினைஞர்கள் எண்ணிக்கை, தறிகள் மற்றும் மூலப்பொருள் மதிப்பின் அடிப்படையில் உங்கள் கடன் தகுதி தீர்மானிக்கப்பட்டுள்ளது."
        },
        'en': {
            'Dairy': "Your credit limit is calibrated based on daily milk volume and livestock count. Self-reported revenue exceeding physical capacity triggers review.",
            'Kirana / Rural Retail': "Your credit limit is calibrated based on floor area, SKU inventory density, and restocking frequency.",
            'Handicraft': "Your credit capacity is calibrated based on active artisan count, looms, and raw material inventory."
        }
    }
    
    template_text = localized_templates.get(lang, localized_templates['en']).get(cluster_name, localized_templates[lang].get('Dairy'))
    
    # Simulated short data URI audio clip for offline-first instant playback
    audio_data_uri = f"data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIwADBwsPEBEXGhweISQnKistMTU4Ojw/QkNGR0pNT1JUV1pcX2NkZ2lrbW9zdHd6fH+Dg4aIi46Rk5WXmZudn6Gkp6mrrq+ws7W4ubu+v8HCxMfJzNDS1dXY2trd3+Di4+Xo6+zt7vDx8vP19vf5+/z+//tQxAYAAAD/////zAAA///////wAAAD///////8AAAA///////gAAAD///////8AAAA///////gAAAD///////8AAAA///////gAAAD///////8AAAA///////gAAA="
    
    return AudioBundle(
        cluster_id=resolved_cluster_id,
        language=lang,
        explanation_template=template_text,
        audio_data_uri=audio_data_uri
    )

