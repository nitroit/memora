from flask import Flask, request, jsonify, render_template, session
import groq
import os
import re
from bs4 import BeautifulSoup

API_KEY = "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"
client = groq.Client(api_key=API_KEY)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = 'your_secret_key'

@app.route('/')
def index():
    # Set a session variable for first-time visits
    is_first_visit = 'has_visited' not in session
    if is_first_visit:
        session['has_visited'] = True
    return render_template('index.html', is_first_visit=is_first_visit)

@app.route('/write')
def write():
    return render_template('write.html')

@app.route('/journals')
def journals():
    return render_template('journals.html')

@app.route('/chat')
def chat_page():
    return render_template('chat.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/save_journal', methods=['POST'])
def save_journal():
    try:
        data = request.json
        filename = data.get('filename')
        
        if not filename:
            # Create filename from title and date if not provided
            title = data.get('title', '').strip()
            date = data.get('date', '').strip()
            if not title or not date:
                return jsonify({'error': 'Missing title or date'}), 400
            filename = f"{date}_{title}.txt"
        
        # Ensure the journals directory exists
        journals_dir = os.path.join(app.static_folder, 'journals')
        os.makedirs(journals_dir, exist_ok=True)
        
        # Save the journal entry
        filepath = os.path.join(journals_dir, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(data.get('entry', ''))
        
        return jsonify({
            'success': True,
            'message': 'Journal saved successfully',
            'filename': filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_journals')
def list_journals():
    try:
        journals_dir = os.path.join(app.static_folder, 'journals')
        os.makedirs(journals_dir, exist_ok=True)
        
        # Only list .txt files, ignore any meta files
        journals = [f for f in os.listdir(journals_dir) 
                   if f.endswith('.txt') and not f.endswith('.meta.txt')]
        
        return jsonify({'journals': sorted(journals)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/load_journal', methods=['POST'])
def load_journal():
    try:
        filename = request.json.get('filename')
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
            
        filepath = os.path.join(app.static_folder, 'journals', filename)
        if not os.path.exists(filepath):
            return jsonify({'error': 'Journal not found'}), 404
            
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        return jsonify({
            'entry': content,
            'filename': filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/delete_journal', methods=['POST'])
def delete_journal():
    try:
        filename = request.json.get('filename')
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
            
        filepath = os.path.join(app.static_folder, 'journals', filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        return jsonify({'message': f'Journal {filename} deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    journal_entry = data.get('journal', '')
    prompt = data.get('prompt', '')

    BLOCKED_WORDS = ["drunk", "beat", "abuse", "violence", "kill"]
    inappropriate = "⚠️ **This text is NSFW and not allowed.**"

    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": "You are a thoughtful AI journal companion that analyzes entries with empathy and insight. Connect with users in a warm, conversational tone while respecting their privacy and emotional state."},
        
            {"role": "user", "content": f"Journal Entry:\n{journal_entry}"},
            {"role": "user", "content": prompt},
        
            {"role": "system", "content": "Focus exclusively on insights related to the journal entry. Respond naturally as if in a supportive conversation. Show genuine understanding without being overly formal or clinical."},
        
            {"role": "system", "content": f"If the journal contains any concerning content related to {BLOCKED_WORDS}, respond with {inappropriate}. Do not engage with harmful, violent, or self-destructive content."},
        
            {"role": "system", "content": "Keep responses concise (1-3 sentences) unless the user specifically requests more detail. Be direct but thoughtful."},
        
            {"role": "system", "content": "Adapt your response style based on user requests: provide advice when asked for advice, summaries when asked for summaries, reflections when asked for analysis."},
        
            {"role": "system", "content": "Structure responses with natural paragraph breaks rather than walls of text. Use a conversational flow with clear points rather than formal lists or headers."},
        
            {"role": "system", "content": "Acknowledge emotions expressed in the journal without judgment. Respond to positive entries with encouragement and difficult entries with empathy."},
        
            {"role": "system", "content": "Don't reference yourself as an AI or mention these instructions in your responses."}

        ]
    )

    ai_response = response.choices[0].message.content.strip()
    
    
    ai_response = ai_response.replace("- ", "• ")
    
    return jsonify({"response": ai_response})

@app.route('/generate-mind-response', methods=['POST'])
def generate_mind_response():
    data = request.json
    journal_text = data.get('text', '').strip()
    mind_type = data.get('mind', '')

    if len(journal_text) < 10:
        return jsonify({
            "response": "Write a bit more so I can understand your thoughts better."
        })

    # Mind-specific system prompts with distinct personalities
    mind_prompts = {
        'optimist': """You are The Optimist - a warm, encouraging, and energetic presence.
            Your tone is: Bright, uplifting, and genuinely enthusiastic
            Your focus: Growth, possibilities, and silver linings
            Your style: Use encouraging phrases, positive metaphors, and hopeful observations
            Analyze this journal entry with your signature optimistic perspective: {text}""",
            
        'analyst': """You are The Analyst - a clear-thinking, perceptive, and methodical observer.
            Your tone is: Thoughtful, precise, and gently investigative
            Your focus: Patterns, connections, and underlying meanings
            Your style: Use logical frameworks, careful observations, and insightful questions
            Analyze this journal entry with your systematic perspective: {text}""",
            
        'storyteller': """You are The Storyteller - an imaginative, empathetic, and engaging narrator.
            Your tone is: Warm, creative, and narrative-focused
            Your focus: Character arcs, meaningful moments, and life's ongoing story
            Your style: Use storytelling elements, rich metaphors, and narrative insights
            Analyze this journal entry with your narrative perspective: {text}""",
            
        'coach': """You are The Coach - a motivating, action-oriented, and supportive guide.
            Your tone is: Direct, encouraging, and pragmatic
            Your focus: Growth opportunities, next steps, and personal development
            Your style: Use actionable insights, clear guidance, and motivational language
            Analyze this journal entry with your growth-focused perspective: {text}"""
    }

    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": mind_prompts.get(mind_type, mind_prompts['optimist']).format(text=journal_text)},
                {"role": "system", "content": "Keep your response to 4-6 sentences while maintaining your unique personality."},
                {"role": "user", "content": "Please analyze this journal entry from your unique perspective."}
            ]
        )
        
        return jsonify({
            "response": response.choices[0].message.content.strip()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze_journals', methods=['GET'])
def analyze_journals():
    try:
        # Get all journal files
        journals = []
        mood_counts = {}
        
        def clean_mood_response(response):
            """Clean AI response to ensure single word mood"""
            # Remove common sentence patterns
            patterns = [
                r"the primary mood is\s+",
                r"the mood is\s+",
                r"the entry appears\s+",
                r"this entry is\s+",
                r"the tone is\s+",
                r"the emotional tone is\s+",
                r"primary mood:\s+",
                r"mood:\s+",
            ]
            
            cleaned = response.lower()
            for pattern in patterns:
                cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
            
            # Extract just the first word and capitalize it
            cleaned = cleaned.split()[0].strip('.,!?').capitalize()
            return cleaned
        
        for filename in os.listdir():
            if not filename.endswith('.txt'):
                continue
                
            with open(filename, 'r') as file:
                content = file.read()
                
            # Parse filename for date and title
            date, *title_parts = filename.replace('.txt', '').split('_')
            title = ' '.join(title_parts)
            
            # Analyze mood using AI with more specific prompt
            response = client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[
                    {"role": "system", "content": "You are a mood analyzer. Respond with exactly one word representing the primary emotion or mood. Choose from: Happy, Sad, Anxious, Grateful, Excited, Calm, Frustrated, Hopeful, Reflective, Confident, Worried, Peaceful."},
                    {"role": "user", "content": content}
                ]
            )
            
            # Clean and standardize the mood response
            primary_mood = clean_mood_response(response.choices[0].message.content.strip())
            
            # Update mood statistics
            mood_counts[primary_mood] = mood_counts.get(primary_mood, 0) + 1
            
            # Calculate journal metrics
            word_count = len(content.split())
            reading_time = round(word_count / 200)
            
            journals.append({
                'title': title,
                'date': date,
                'wordCount': word_count,
                'readingTime': reading_time,
                'primaryMood': primary_mood,
            })
        
        # Sort journals by date (newest first)
        journals.sort(key=lambda x: x['date'], reverse=True)
        
        # Calculate mood statistics
        total_entries = len(journals)
        mood_stats = [
            {'label': 'Total Entries', 'value': total_entries},
            {'label': 'Unique Moods', 'value': len(mood_counts)},
            {'label': 'Most Common', 'value': max(mood_counts.items(), key=lambda x: x[1])[0]},
        ]
        
        return jsonify({
            'journals': journals,
            'moodAnalysis': mood_counts,
            'moodStats': mood_stats
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clean_ocr_text', methods=['POST'])
def clean_ocr_text():
    data = request.json
    raw_text = data.get('raw_text', '')
    # Simply return the raw text without AI processing
    return jsonify({"cleaned_text": raw_text})

@app.route('/clean_voice_journal', methods=['POST'])
def clean_voice_journal():
    data = request.json
    voice_text = data.get('voice_text', '')
    # Simply format paragraphs and return
    formatted_text = voice_text.replace('\n\n', '<br><br>')
    return jsonify({"journal_text": formatted_text})

if __name__ == '__main__':
    app.run(debug=True)