import json,math,sys
R=json.load(open('/workspace/yehsa-r7/tools/mappacks/regions.json'))['regions']
def t(lon,lat,z):
    n=2**z; x=int((lon+180)/360*n); la=math.radians(lat); y=int((1-math.log(math.tan(la)+1/math.cos(la))/math.pi)/2*n); return x,y
s=set()
zmax=int(sys.argv[1])
for r in R:
    w,so,e,no=r['bbox']
    for z in range(5,zmax+1):
        x0,y0=t(w,no,z); x1,y1=t(e,so,z)
        for x in range(x0,x1+1):
            for y in range(y0,y1+1): s.add((z,x,y))
print(len(s))
json.dump(sorted(s),open(f'list{zmax}.json','w'))
