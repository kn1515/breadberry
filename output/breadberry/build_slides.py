"""Generate editable presentation elements, authored exclusively with officecli batch."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
commands = []
NAVY, CREAM, BERRY, MUTED = '182D35', 'F7F5EE', 'B9315C', '52646A'

def add(slide, x, y, w, h, text='', size=20, color=NAVY, fill='none', **extra):
    props = dict(x=f'{x}pt', y=f'{y}pt', width=f'{w}pt', height=f'{h}pt',
                 text=text, size=str(size), color=color, fill=fill, line='none',
                 font='Yu Gothic', margin='0pt', valign='center', autoFit='none')
    props.update({k:str(v) for k,v in extra.items()})
    commands.append(dict(command='add', parent=f'/slide[{slide}]', type='shape', props=props))

def box(s,x,y,w,h,fill,**kw):
    add(s,x,y,w,h,fill=fill,geometry='roundRect',adj='adj:val 6000',**kw)

def txt(s,x,y,w,h,text,size=20,color=NAVY,**kw):
    add(s,x,y,w,h,text,size,color,**kw)

def line(s,x,y,w,h,color):
    add(s,x,y,w,h,fill=color)

commands.append(dict(command='set',path='/',props=dict(slideWidth='960pt',slideHeight='540pt',
    title='breadberry | 初めての電子工作に、伴走するAI',author='breadberry',
    description='顧客像・課題、AIとCGによるアプローチ、CGモデル化への挑戦。発表先: https://classmethod.connpass.com/event/398580/')))
for i in range(2):
    commands.append(dict(command='add',parent='/',type='slide',props=dict(background=CREAM,name=['顧客像と課題','アプローチと技術的な工夫'][i])))

# Slide 1: team, audience, two concrete obstacles.
txt(1,48,28,600,24,'TEAM  /  breadberry',12,BERRY,bold='true',font='Lato',spacing='1.5')
txt(1,46,59,680,67,'breadberry',54,NAVY,bold='true',font='Lato')
txt(1,48,128,780,40,'初めての電子工作に、伴走するAI。',28,bold='true')
# Circuit-inspired brand mark.
box(1,811,55,101,101,NAVY)
for xx,yy in [(829,76),(850,76),(871,76),(829,97),(850,97),(871,97),(829,118),(850,118),(871,118)]:
    add(1,xx,yy,7,7,fill='71958B',geometry='ellipse')
line(1,852,80,24,4,'F0BD63')
line(1,872,80,4,42,'F0BD63')
add(1,867,113,14,14,fill='F0BD63',geometry='ellipse')

box(1,48,192,864,85,'E8EDE7')
txt(1,68,204,92,24,'顧客像',14,MUTED,bold='true')
txt(1,175,201,710,31,'都内在住の20〜30代・電子工作を趣味で始めた人',21,bold='true')
txt(1,175,236,710,26,'社会人（新入社員を含む）・学生',18,MUTED)
txt(1,48,295,864,39,'趣味で始めたのに、最初の一歩が難しい。',26,bold='true')
for x,num,title,body in [(48,'01','設計ができない','作りたいものを、回路に落とせない。'),
                         (490,'02','部品を選べない','どの部品を購入すればよいかわからない。')]:
    box(1,x,350,422,123,'FFFFFF')
    line(1,x,369,4,38,BERRY)
    txt(1,x+21,362,42,25,num,14,BERRY,bold='true',font='Lato')
    txt(1,x+21,390,378,34,title,25,bold='true')
    txt(1,x+21,435,385,24,body,16,MUTED)
txt(1,48,502,750,18,'電子工作の「わからない」を、一歩ずつ減らす。',12,MUTED)
txt(1,858,502,54,18,'01 / 02',11,MUTED,font='Lato',align='right')

# Slide 2: approach and a clearly labeled conceptual wiring guide.
txt(2,48,28,750,24,'breadberry  /  APPROACH',12,BERRY,bold='true',font='Lato',spacing='1.5')
txt(2,48,67,864,48,'部品選びから結線まで、AIが伴走。',32,bold='true')
box(2,48,137,407,254,'FFFFFF')
box(2,505,137,407,254,NAVY)
txt(2,70,153,363,23,'01  /  AIエージェント',14,BERRY,bold='true')
txt(2,70,189,363,40,'必要な部品を教える',26,bold='true')
txt(2,70,239,363,58,'何を購入すればよいか、\n部品選びをサポート。',19,MUTED,lineSpacing='1.2x')
# Editable schematic of a parts list.
for x,w,label in [(70,103,'ボード'),(183,103,'部品'),(296,136,'ケーブル')]:
    box(2,x,315,w,46,'E8EDE7')
    txt(2,x,315,w,46,label,17,MUTED,align='center')
add(2,468,247,25,25,fill=BERRY,geometry='chevron')
txt(2,527,153,363,23,'02  /  CGガイド',14,'F0BD63',bold='true')
txt(2,527,189,363,40,'結線をひとつずつ教える',25,'FFFFFF',bold='true')
txt(2,527,239,363,27,'「次にどこをつなぐか」を可視化。',17,'DEE8E5')
# Breadboard miniature: intended as a conceptual illustration, not a circuit specification.
box(2,529,285,193,73,'E7ECE6')
line(2,542,293,166,2,'B9315C')
line(2,542,346,166,2,'7293B4')
line(2,541,321,168,4,'C1CCC7')
for row in [305,313,331,339]:
    for col in range(14):
        add(2,544+col*12,row,3,3,fill='8B9C95',geometry='ellipse')
line(2,570,310,5,29,'B9315C')
line(2,570,333,101,5,'B9315C')
add(2,563,303,18,18,fill='none',line='F0BD63:2',geometry='ellipse')
add(2,662,328,18,18,fill='none',line='F0BD63:2',geometry='ellipse')
txt(2,739,290,150,24,'1本ずつ案内',18,'FFFFFF',bold='true')
txt(2,739,321,151,37,'結線ガイドの\nイメージ',12,'BFD0CC')
box(2,48,412,864,81,'E8EDE7')
txt(2,68,425,129,22,'技術的な工夫',14,MUTED,bold='true')
txt(2,215,422,665,28,'手取り足取り教える体験を目指して、',21,bold='true')
txt(2,215,452,665,28,'部品・結線のCGモデル化にチャレンジ。',21,bold='true')
txt(2,48,502,750,18,'使用技術：Google Cloud Run / Firestore / Next.js / Gemini API / GMI Cloud / Tailwind CSS',11,MUTED)
txt(2,858,502,54,18,'02 / 02',11,MUTED,font='Lato',align='right')

notes = [
    'チームbreadberryです。初めての電子工作に伴走するAIを提案します。対象は、都内在住の20〜30代で、趣味で電子工作を始めた社会人や学生、新入社員です。電子工作を始めても、設計ができない、どの部品を購入すればよいかわからないという壁があります。この最初のハードルを下げたいと考えました。',
    'アプローチは2つです。まず、必要な部品を教えてくれるAIエージェントが部品選びをサポートします。次に、CGで結線をひとつずつ案内します。技術的には、手取り足取り教えるような体験を目指して、CGモデル化にチャレンジしました。図は結線ガイドのコンセプトを説明する模式図で、実装画面や実際の回路図ではありません。'
]
for n,note in enumerate(notes,1):
    commands.append(dict(command='set',path=f'/slide[{n}]',props=dict(notes=note)))
batch_path=ROOT/'slides.officecli.json'
batch_path.write_text(json.dumps(commands,ensure_ascii=False,indent=2))
result=subprocess.run(['officecli','batch',str(ROOT/'breadberry_pitch.pptx'),'--input',str(batch_path),'--stop-on-error'],capture_output=True,text=True)
(ROOT/'build.log').write_text(result.stdout+result.stderr)
print(f'officecli batch: {len(commands)} commands; exit={result.returncode}')
if result.returncode:
    print(result.stdout[-4000:],result.stderr[-2000:])
raise SystemExit(result.returncode)
