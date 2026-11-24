from PIL import Image
import io,glob,json,os
from multiprocessing import Pool
def enc(p):
    z,x,y=os.path.basename(p)[:-4].split('_')
    im=Image.open(p).convert('RGB'); r,g,b=im.split()
    im2=Image.merge('RGB',(r,g.point(lambda v:v&~1),b.point(lambda v:0)))
    o=io.BytesIO(); im2.save(o,'WEBP',lossless=True,quality=80,method=4)
    return (f'{z}/{x}/{y}',o.getvalue())
if __name__=='__main__':
    files=sorted(glob.glob('raw/*.png'))
    with Pool(os.cpu_count()) as pool: res=pool.map(enc,files,chunksize=8)
    idx={};off=0
    with open('yehsa_dem_terrain.ydm','wb') as f:
        for k,d in res:
            idx[k]=[off,len(d)]; f.write(d); off+=len(d)
    json.dump({"format":"terrarium-webp","minZoom":5,"maxZoom":9,"quantizedMeters":2,"source":"AWS Terrain Tiles (Terrarium): USGS 3DEP, SRTM, GMTED, ETOPO1","tiles":idx},open('yehsa_dem_index.json','w'),separators=(',',':'))
    print(len(idx),off)
